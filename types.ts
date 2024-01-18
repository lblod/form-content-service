export type FormDefinition = {
  formTtl: string;
  metaTtl?: string | null;
};

export type Instance = {
  uri: string;
  id: string;
  label: string;
};

export type InstanceInput = {
  contentTtl: string;
  instanceUri: string;
};

export type FormsFromConfig = {
  [key: string]: FormDefinition | undefined;
};
