import Router from 'express-promise-router';
import { Request, Response } from 'express';

import { fetchFormDirectoryNames } from '../services/forms-from-config';
import { fetchCustomFormTypes } from '../services/custom-forms';
import { getInstancesForForm } from '../services/form-instances';

export const customFormRouter = Router();

customFormRouter.get(
  '/form-type-options',
  async (req: Request, res: Response) => {
    const defaultTypeIds = await fetchFormDirectoryNames();
    const customTypes = await fetchCustomFormTypes();

    return res.status(200).send({
      defaultTypes: defaultTypeIds.map((id) => {
        return {
          typeId: id,
          label: id,
        };
      }),
      customTypes,
    });
  },
);
customFormRouter.get(
  '/:formTypeId/form-options',
  async (req: Request, res: Response) => {
    const form = await getInstancesForForm(req.params.formTypeId, {});
    const labelProperty = form.labels[0].name;
    return res.status(200).send({
      form,
      forms: form.instances.map((instance) => {
        return {
          id: instance.id,
          label: instance[labelProperty] ?? instance.id,
        }
      })
    });
  },
);
customFormRouter.get(
  '/:formId/summary-fields',
  async (req: Request, res: Response) => { },
);
