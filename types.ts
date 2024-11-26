export type FormDefinition = {
  formTtl: string;
  metaTtl?: string | null;
};

export type Label = {
  name: string;
  uri: string;
  var: string;
};

export type InstanceMinimal = {
  uri: string;
  id: string;
};

export type InstanceData = {
  formInstanceTtl: string;
  instanceUri: string;
};

export type InstanceInput = {
  contentTtl: string;
  instanceUri: string;
};

export type FormsFromConfig = {
  [key: string]: FormDefinition | undefined;
};

export type UriToIdMap = {
  [key: string]: string | undefined;
};
