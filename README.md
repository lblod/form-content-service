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

Listing of form instances is done based on a the form definition. The form definition specifies the type of instances it acts on and the way these instances are to be rendered using `form:targetType` and `form:targetLabel` respectively. The targetLabel specifies the predicate to be used to fetch a label to use when rendering the form instance. In the future this can be extended to multiple paths to render different labels. Form instances are paginated, with a default of 20 instances per page. Pagination is controlled through a `?limit` and `?offset` query parameter. The total number of instances is returned in the `x-total-count` header.

### Defining the URI prefix for form instances

The URI prefix of a form instance can be specified in the form.ttl file. This can be done by adding a triple of the following form: `ext:form ext:prefix <prefix>`. The prefix is a variable and should be a string, but otherwise there are no restrictions. If no prefix is defined, the following prefix will be used by default: `https://data.lblod.info/form-data/instances/`.

### Links to other types

To link to instances of another type, the form needs to be able to:

- search instances based on a string
- visualize instances using some string (form:instanceLabelProperty)
- fetch instances based on their uri (form:instanceApiUrl)

All of these capabilities are supported by resources, BUT since we will need to support custom forms as well in the future and users may want to link to those forms, we will need to be slightly more general. We cannot assume that the instances of these forms will be represented in resources. Therefore, we will allow links to form instances to define a base url where to fetch the instances and a property to use as a label to render the result. The service handling requests to this base url MUST therefore follow the resources input and JSON-API response format.

If a form field with uri `field:1` represents a link to another instance, it MUST use the triple `field:1 form:displayType displayTypes:instanceSelector .` or a single instance selector OR `field:1 form:displayType displayTypes:instanceMultiSelector .` for a multi-instance selector.
For fields with this display type, the field MUST define the base url to fetch instances using `field:1 form:instanceApiUrl "http://some-endpoint.example.com/path/with/hops"` OR `field:1 form:instanceApiUrl "/path/with/hops"`. The url here can be either a fully qualified domain OR an url relative to where the frontend is running. We will call the endpoint running at this url the `instance endpoint` below.
Furthermore, fields with this display type MUST define the property used to render options using `field:1 form:instanceLabelProperty "propertyName"` and this property MUST be a property returned in the JSON api response of the endpoint. This is the poperty/attribute of the instance that will be displayed to represent the instance in the dropdown of the corresponding component of this form field.

The `instance endpoint` MUST only ever return instances that can be connected to the form instance through the form field that specifies it. It MUST support search by adding a`?filter=search string` query parameter to the url. If such a string is passed in, it MUST return all instances that contain this string (case-insensitive) in any property.

The endpoint MUST follow the [JSONAPI](http://jsonapi.org/format/#fetching-pagination) spec when returning instances and MAY support pagination using the `page[number]` and `page[size]` variant.

The endpoint MUST allow fetching a specific instance using a query parameter `?filter[:uri:]=http://myinstanceuri`. That representation MUST then return the JSONAPI representation of this instance if it exists and include the `form:instanceLabelProperty` property in its response. If it doesn't exist it MUST return an empty list.

The specification above for the `instance endpoint` is a subset of the specification for mu-cl-resources. So using a resources endpoint will always be a correct value for the instance endpoint. It is allowed to define your own endpoint as long as you follow this spec though. This is useful in case your instances cannot be fetched through resources for instance, e.g. for custom forms created by the form builder.

### Deleting form instances

When a form instance is deleted, a [tombstone](https://www.stevebate.net/ontologies/activitystreams2/class-astombstone.html) is erected for every uri where a triple was removed that expresses the type for that uri. E.g. if on delete of a form instance, the following triple is removed

```
  ext:1 a foaf:Person .
```

Then the following data is inserted in the store:

```
  ext:1 a as:Tombstone ;
        as:formerType foaf:Person ;
        as:deleted "thetimeofdelete"^^xsd:dateTime  .
```

## Extending Forms

### Predicates and Types

Use the same model as regular forms, with the following differences:

- To connect a field/section to a section of the owning form, use `ext:extendsGroup` instead of `sh:group`.
- If you want to introduce a new section in your extension, still use `sh:group`.
- Use `ext:extendsForm` to connect to the URI of the form being extended.

An extension (type: `form:Extension`) is represented by

    <extensionUri> a form:Extension ;
                   form:includes <fieldUri> ;
                   ext:extendsForm <formUri> ;
                   mu:uuid "b5a86f3a-aac8-4911-a3fb-37f9f194b58e" .

Note that if you want to add a field to an existing Section, there is no need to define that section again using a `sh:group` from the extension to the section. This link is already specified in the original form. You only need to add a link like this for entirely new sections that you create.

### Order

We want fields to be added to the original form in a specific order, intermixed with the existing fields (before, after, between). Unfortunately, the order property is an integer and loses float/double precision if it is added to it. Therefore we should leave gaps of e.g. 100 between the order properties of our forms.

### Extending the form with direct properties

In an extension, we should be able to specify the same direct properties that we use in a regular form. In that case, we should define them on the `form:Extension`, instead of on the `form:Form`, using the same predicates as the ones used on the `form:Form`. The form-content service will take the `form:Extension` instance and transform it into a `form:Form` instance that contains the combination of the new properties and the properties that exist on the form that is being extended.

### Transparency of `form:Extension`s

To clients of the form-content service, instances of the `form:Extension` class will be presented as instances of the `form:Form` class. To the client, the only difference is the existence of the extra `form:Extension` class, which they should be able to ignore.

### Recursive Extension

Because a form extension is translated directly into a regular form, it is straight forward to create an extension of an extension. In that case, the `form:extends` predicate points to the URI of another `form:Extension`. The translation to a form follows the following algorithm:

    def extension_to_form(uri):
      extended = get_extended(uri)
      if is_extension(extended):
        extended_as_form = extension_to_form(extended)
        return merge_into_form(extended_as_form, uri)
      else:
        return merge_into_form(extended, uri)

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
