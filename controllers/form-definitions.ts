import express from 'express';
import { fetchFormDefinition } from '../services/form-definitions';

const formDefinitionRouter = express.Router();

formDefinitionRouter.get('/:id', async function (req, res) {
  const { formTtl, metaTtl } = await fetchFormDefinition(req.params.id);
  res.send({ formTtl, metaTtl });
});

export { formDefinitionRouter };
