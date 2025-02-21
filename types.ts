export type FormDefinition = {
  formTtl: string;
  metaTtl?: string | null;
  custom?: boolean;
  uri: string;
};

export type Label = {
  name: string;
  uri: string;
  var: string;
  order?: number;
  type?: string;
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
