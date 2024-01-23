# Form Content Service

This is a service that manages the contents of instances created through semantic forms. The definitions of forms are not (currently?) managed by this service.

> [!CAUTION]
> This service is under construction and is not ready to be used in a production environment

## Local Development

To build this service, first user docker build, e.g.

```
docker build -t local-form-manager .
```

Then run it by running e.g.:

```
docker run --rm -it -p 9229:9229 -p 8081:80 -e NODE_ENV=development local-form-manager
```

Running it in development mode and exposing port 9229 allows you to connect your debugger to the docker.

## Model

This service follows the semantic forms model and to that end uses the ember-submission-form-fields package. However, some extensions are needed and they may not have made it into the form spec yet. The main extensions are: listing form instance, defining the uri prefix for form instances, linking to other types (possibly forms) using dropdowns etc.

### Listing Form Instances

Listing of form instances is done based on a label. When a form instance is pushed to this service the form-definition is parsed to find an associated label. This label is then coupled to the form instance, so these instances can be easily returned based on the form id.
To be able to do this the form-definition needs to contain a triple with the following subject and predicate: `ext:form ext:label <labelID>`. The labelID is variable and should be a string, but otherwise does not have any restrictions. This id should be unique, this is not checked in the service. If you have a duplicate id, both forms and their instances will be linked to that label.

### Defining the URI prefix for form instances

The URI prefix of a form instance can be specified in the form.ttl file. This can be done by adding a triple of the following form: `ext:form ext:prefix <prefix>`. The prefix is a variable and should be a string, but otherwise there are no restrictions. If no prefix is defined, the following prefix will be used by default: `https://data.lblod.info/form-data/instances/`.

### Links to other types

To link to instances of another type, the form needs to be able to:

- search instances based on a string
- visualize instances using some string
- fetch instances based on their uri

All of these capabilities are supported by resources, BUT since we will need to support custom forms as well in the future and users may want to link to those forms, we will need to be slightly more general. We cannot assume that the instances of these forms will be represented in resources. Therefore, we will allow links to form instances to define a base url where to fetch the instances and a property to use as a label to render the result. The service handling requests to this base url MUST therefore follow the resources input and JSON-API response format.

If a form field with uri `field:1` represents a link to another instance, it MUST use the triple `field:1 form:displayType displayTypes:instanceSelector .` or a single instance selector OR `field:1 form:displayType displayTypes:instanceMultiSelector .` for a multi-instance selector.
For fields with this display type, the field MUST define the base url to fetch instances using `field:1 form:instanceApiUrl "http://some-endpoint.example.com/path/with/hops"` OR `field:1 form:instanceApiUrl "/path/with/hops"`. The url here can be either a fully qualified domain OR an url relative to where the frontend is running. We will call the endpoint running at this url the `instance endpoint` below.
Furthermore, fields with this display type MUST define the property used to render options using `field:1 form:instanceLabelProperty "propertyName"` and this property MUST be a property returned in the JSON api response of the endpoint. This is the poperty/attribute of the instance that will be displayed to represent the instance in the dropdown of the corresponding component of this form field.

The `instance endpoint` MUST only ever return instances that can be connected to the form instance through the form field that specifies it. It MUST support search by adding a`?filter=search string` query parameter to the url. If such a string is passed in, it MUST return all instances that contain this string (case-insensitive) in any property.

The endpoint MUST follow the [JSONAPI](http://jsonapi.org/format/#fetching-pagination) spec when returning instances and MAY support pagination using the `page[number]` and `page[size]` variant.

The endpoint MUST allow fetching a specific instance using a query parameter `?filter[:uri:]=http://myinstanceuri`. That representation MUST then return the JSONAPI representation of this instance if it exists and include the `form:instanceLabelProperty` property in its response. If it doesn't exist it MUST return an empty list.

The specification above for the `instance endpoint` is a subset of the specification for mu-cl-resources. So using a resources endpoint will always be a correct value for the instance endpoint. It is allowed to define your own endpoint as long as you follow this spec though. This is useful in case your instances cannot be fetched through resources for instance, e.g. for custom forms created by the form builder.

## Limitations

### No Generator Shape Paths

Currently, this service only supports generators with simple paths in their shape, e.g.

```
ext:mandatarisG a form:Generator;
  form:prototype [
    form:shape [
      a ns:Mandataris
    ]
  ];
  form:dataGenerator form:addMuUuid.
```

This generator's shape only has direct attributes (a ns:Mandataris) without modifiers, like sh:inversePath. Anything more complicated will not be handled by this service yet.

For instance, this shape is **not supported**:

```
ext:mandatarisG a form:Generator;
  form:prototype [
    form:shape [
      a ns:Mandataris
      mandaat:isBestuurlijkeAliasVan / foaf:name "De Grote Smurf"
    ]
  ];
  form:dataGenerator form:addMuUuid.
```

### No Modified Simple Paths in fields or generator scopes

Fields and Generators can each define a scope. This service supports simple paths (e.g. `foaf:name`) and complex paths (e.g. `( [ sh:inversePath mandaat:isAangesteldAls ] foaf:name )`). However, modified simple paths are **not supported** (e.g. `[ sh:inversePath mandaat:isAangesteldAls ]`). Luckily, these can always be written in their complex form, which IS supported: `( [ sh:inversePath mandaat:isAangesteldAls ] )` (note the wrapping brackets in this case, signifying a linked list in RDF).
