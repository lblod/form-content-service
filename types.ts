export type FormDefinition = {
  formTtl: string;
  metaTtl?: string | null;
};

export type InstanceMinimal = {
  uri: string;
  id: string;
  label: string;
};

export type InstanceData = {
  formDataTtl: string;
  instanceUri: string;
};

export type InstanceInput = {
  contentTtl: string;
  instanceUri: string;
};

export type FormsFromConfig = {
  [key: string]: FormDefinition | undefined;
};
