#!/bin/bash
set -e
cdk_context="$(npm run -s cdk context -- -j)"

druid_version=$(echo "$cdk_context" | grep "druidVersion" | awk '/druidVersion/{print $NF}' | tr -d '"' | tr -d ',')
druid_version=${druid_version:-26.0.0}

druid_operator_version="v1.0.0"
druid_operator_repo="https://github.com/datainfrahq/druid-operator"

do_cmd() 
{
    echo "------ EXEC $*"
    $*
    rc=$?
    if [ $rc -gt 0 ]
    then
            echo "Aborted - rc=$rc"
            exit $rc
    fi
}

check_tools()
{
    local command=$1
    if type "$command" >/dev/null 2>&1; then
        echo "$command exists"
    else
        echo "Error: $command does not exist. Please install $command first."
        return 1
    fi
}

build_druid_cloudwatch() 
{
    echo "building druid cloudwatch emitter extension"
    cd DruidCloudwatchExtension && \
       mvn clean verify package && \
       rm -rf ../lib/docker/extensions/druid-cloudwatch/ && \
       mkdir -p ../lib/docker/extensions/druid-cloudwatch/ && \
       cp -f target/druid-cloudwatch-25.0.0-jar-with-dependencies.jar ../lib/docker/extensions/druid-cloudwatch/ && cd ..
}

build_druid_oidc()
{
    echo "building druid oidc extension"
    ls -l
    cd DruidOidcExtension && \
       mvn clean verify package && \
       rm -rf ../lib/docker/extensions/druid-oidc/ && \
       mkdir -p ../lib/docker/extensions/druid-oidc/ && \
       cp -f target/druid-oidc-25.0.0-jar-with-dependencies.jar ../lib/docker/extensions/druid-oidc/
}

build_druid_xbasic()
{
    echo "building druid xbasic extension"
    ls -l
    cd DruidXBasicExtension && \
       mvn clean verify package && \
       rm -rf ../lib/docker/extensions/druid-xbasic/ && \
       mkdir -p ../lib/docker/extensions/druid-xbasic/ && \
       cp -f target/druid-xbasic-25.0.0-jar-with-dependencies.jar ../lib/docker/extensions/druid-xbasic/
}

download_druid_operator()
{
    echo "downloading druid operator repository from GitHub"
    rm -rf ./druid-operator ./lib/druid-operator-chart
    git clone -b ${druid_operator_version} --single-branch --depth 1 ${druid_operator_repo} && \
        mv ./druid-operator/chart ./lib/druid-operator-chart && rm -rf ./druid-operator
}

download_and_verify_file() 
{
    local version=$1
    local download_url=$2
    local target_directory=$3
    local target_filename=$4

    mkdir -p "$target_directory"
    local file_path="${target_directory}/${target_filename}-${version}-bin.tar.gz"
    local checksum_url="${download_url}.sha512"

    if [ -f "$file_path" ]; then
        echo "$file_path exists, skip downloading"
    else
        curl -f -o "$file_path" "$download_url"
    fi

    if [ ! -f "${file_path}.sha512" ]; then
        curl -o "${file_path}.sha512" "$checksum_url"
    fi

    local file_checksum=$(openssl sha512 -r "$file_path" | awk '{print $1}')
    local file_checksum_sha512=$(cat "${file_path}.sha512" | awk '{print $1}')
    if [ "$file_checksum" != "$file_checksum_sha512" ]; then
        echo "Error: $target_filename file checksum does not match"
        return 1
    fi
}

download_druid() 
{
    download_url="https://archive.apache.org/dist/druid/${druid_version}/apache-druid-${druid_version}-bin.tar.gz"
    download_and_verify_file "$druid_version" "$download_url" "./druid-bin" "apache-druid"
}

download_zookeeper() 
{
    local zookeeper_version=$(echo "$cdk_context"  | grep "zookeeperVersion" | awk '/zookeeperVersion/{print $NF}' | tr -d '"' | tr -d ',')
    zookeeper_version=${zookeeper_version:-3.8.0}
    download_url="https://archive.apache.org/dist/zookeeper/zookeeper-${zookeeper_version}/apache-zookeeper-${zookeeper_version}-bin.tar.gz"
    download_and_verify_file "$zookeeper_version" "$download_url" "./zookeeper-bin" "apache-zookeeper"
}

download_rds_ca_bundle()
{
    rm -rf ./lib/docker/ca-certs
    mkdir -p ./lib/docker/ca-certs
    curl -f -o ./lib/docker/ca-certs/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
    curl -f -o ./lib/docker/ca-certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
    cat ./lib/docker/ca-certs/AmazonRootCA1.pem ./lib/docker/ca-certs/global-bundle.pem > ./lib/docker/ca-certs/rds-bundle.pem
    rm -rf ./lib/docker/ca-certs/AmazonRootCA1.pem ./lib/docker/ca-certs/global-bundle.pem
}

download_statsd_emitter() 
{
    local extensions_directory="./lib/docker/extensions"
    if [ ! -d "$extensions_directory/statsd-emitter" ]; then
        tar -xvf druid-bin/apache-druid-${druid_version}-bin.tar.gz
        java --add-exports=java.base/jdk.internal.misc=ALL-UNNAMED \
             --add-exports=java.base/jdk.internal.ref=ALL-UNNAMED \
             --add-opens=java.base/java.nio=ALL-UNNAMED \
             --add-opens=java.base/sun.nio.ch=ALL-UNNAMED \
             --add-opens=java.base/jdk.internal.ref=ALL-UNNAMED \
             --add-opens=java.base/java.io=ALL-UNNAMED \
             --add-opens=java.base/java.lang=ALL-UNNAMED \
             --add-opens=jdk.management/com.sun.management.internal=ALL-UNNAMED \
             -classpath "apache-druid-${druid_version}/lib/*" org.apache.druid.cli.Main tools pull-deps --no-default-hadoop -c \
            "org.apache.druid.extensions.contrib:statsd-emitter:${druid_version}" -l apache-druid-${druid_version}/extensions
        mkdir -p $extensions_directory/statsd-emitter
        cp -f ./extensions/statsd-emitter/* $extensions_directory/statsd-emitter/
        rm -rf extensions hadoop-dependencies apache-druid-${druid_version}
    fi
}

build_config_version_tree() 
{
    # Loop through files and directories in the current directory
    for item in lib/uploads/config/*; do
        if [ -d "$item" ]; then
            # If item is a directory, recursively call the function on it
            find ${item} -type f | sort | xargs cat | git hash-object --stdin > ${item}_version.txt
        fi
    done
}

search_ec2_instance_types()
{
    local instance_types="$@"

    if [ -n "$(echo "$cdk_context" | jq -r '.region // ""')" ]; then
        region="$(echo "$cdk_context" | jq -r '.region // ""')"
    elif [ -n "$AWS_REGION" ]; then
        region="$AWS_REGION"
    elif [ -n "$AWS_DEFAULT_REGION" ]; then
        region="$AWS_DEFAULT_REGION"
    elif [ -n "$(aws configure get region)" ]; then
        region="$(aws configure get region)"
    fi

    if [ -z "$region" ]; then
        echo "Error: unable to search Ec2 instance types. Please make sure region is set."
        return 1
    fi

    mkdir -p lib/instance-types

    for instance_type in $instance_types; do
        if [ ! -s "lib/instance-types/$instance_type.json" ]; then
            if aws ec2 describe-instance-types --instance-type "$instance_type" --region $region --output json > "lib/instance-types/$instance_type.json.tmp" \
                   && [ -s "lib/instance-types/$instance_type.json.tmp" ]; then
                mv "lib/instance-types/$instance_type.json.tmp" "lib/instance-types/$instance_type.json"
            else
                rm -f "lib/instance-types/$instance_type.json.tmp"
                echo "Error: unable to search Ec2 instance type $instance_type. Please make sure $instance_type is correct."
                return 1
            fi
        fi
    done
}

do_cmd check_tools git
do_cmd check_tools mvn
do_cmd check_tools javac
do_cmd check_tools curl
do_cmd check_tools docker
do_cmd check_tools aws
do_cmd check_tools jq

do_cmd build_config_version_tree

if echo "$cdk_context"  | grep -q "druidOperationPlatform.*ec2"; then
    do_cmd download_druid
    do_cmd download_zookeeper

    do_cmd search_ec2_instance_types "$(echo "$cdk_context" | jq -r -c '.druidEc2Config | to_entries[] | .value.instanceType' | uniq | tr '\n' ' ')"
fi

if echo "$cdk_context"  | grep -q "druidOperationPlatform.*eks"; then
    if [ "$(echo "$cdk_context" | jq -r -c '.druidEksConfig.capacityProviderType')" = "ec2" ]; then
        do_cmd search_ec2_instance_types "$(echo "$cdk_context" | jq -r -c '.druidEksConfig.capacityProviderConfig | to_entries[] | .value.instanceType' | uniq | tr '\n' ' ')"
    fi
    do_cmd download_druid_operator
fi

if echo "$cdk_context"  | grep -q "statsd-emitter"; then
    do_cmd download_statsd_emitter
fi

do_cmd download_rds_ca_bundle

do_cmd build_druid_cloudwatch

do_cmd build_druid_oidc

do_cmd build_druid_xbasic

