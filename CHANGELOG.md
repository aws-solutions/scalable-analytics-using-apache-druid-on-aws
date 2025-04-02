# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2024-04-02

### Security

- Upgrade Druid to v31.0.0
- Upgrade EC2 AMI to AL2023
- Patch cross-spawn, esbuild and aws-cdk-lib vulnerabilities

### Fixed

- Fix broken CloudWatch agent integration

## [1.0.5] - 2024-10-24

### Security

- Upgrade to Java 17 and NodeJS 20
- Patched Apache Commons IO vulnerability
- Change EC2 userdata script to install Python 3.10

### Fixed

- Fix Data Node Splitting in Tiers [#33](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/33)

### Added

- Apache curl alternative url for Druid and Zookeeper for installation in case archive.apache is unavailable

## [1.0.4] - 2024-09-18

### Security

- Patch versions of path-to-regexp, aws-cdk and micromatch

## [1.0.3] - 2024-08-19

### Security

- Upgrade Zookeeper to the latest patch version of v3.8.4
- Upgrade Druid to v30.0.0
- Upgrade Druid-Operator to be v1.2.3
- EC2 instances now require IMDSv2
- Patch axios vulnerability

### Fixed

- Empty S3 buckets during teardown if needed
- Gracefully delete CloudWatch Synthetics Canary network interfaces

## [1.0.2] - 2024-08-07

### Security

- Patched fast-xml-parser vulnerability

## [1.0.1] - 2024-07-01

### Fixed

- Fix the outdated segmentCache selection strategy runtime config [#11](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/11)
- Fix log/metrics endpoints when fips enabled [#14](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/14)

### Added

- allow solution to config internal system [#7](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/7)
- Update zk netplan render to handle docker bridge network interface[#8](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/8)
- add support to define custom oidc scopes [#9](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/9)
- Bump CloudWatch Synthetics runtime version [#10](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/10)
- Add vpc to all lambdas, allow users to self manage install bucket assets [#15](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/15)
- setup nvme disk for data/historical/middlemanager [#16](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/16)
- Use proper cfn endpoint, update name tag to include tier [#22](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/22)
- adding graceful shutdown for druid process [#23](https://github.com/aws-solutions/scalable-analytics-using-apache-druid-on-aws/pull/23)

### Changed

- for pac4j version change: OidcAuthenticator.java, OidcConfig.java, OidcFilter.java, OidcSessionStore.java
- ec2 user data for provisioning changes
- deprecated RDS certificate name changed from RDS_CA_RDS2048_G1 to RDS_CA_RSA2048_G1
- deprecated CloudWatch VPC endpoint name changed from CLOUDWATCH to CLOUDWATCH_MONITORING
- README instructions
- cdk version updated to 2.146.0
- Druid release to 29.0.1
- braces package to 3.0.3 due to CVE-2024-4068
- unit test improvements
- pac4j package to 4.5.7 due to CVE-2021-44878
- druid-oidc to 29.0.1
- guava to 32.0.0-jre due to CVE-2023-2976

## [1.0.0] - 2024-01-09

### Added

- All files, initial version
