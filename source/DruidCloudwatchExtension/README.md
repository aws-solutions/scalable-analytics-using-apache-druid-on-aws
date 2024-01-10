## Welcome!

This package will help to publish Druid service metrics to cloudwatch.

## How to use
- Build the jar `mvn clean` and `mvn package`
- Create directory inside druid extensions path named `druid-cloudwatch`
- Copy the jar in 'druid-cloudwatch' directory
- Edit common.runtime.properties file
- Add "druid-cloudwatch" in extensions list
- add `druid.emitter=cloudwatch`
** It will start publishing metrics to cloudwatch workspace. 


## Useful links:
* https://druid.apache.org/docs/0.19.0/operations/metrics.html
