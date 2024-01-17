import { app, errorHandler } from 'mu';
import Router from 'express-promise-router';
import { loadFormsFromConfig } from './form-repository';
import { formDefinitionRouter } from './controllers/form-definitions';
import { formInstanceRouter } from './controllers/form-instances';

const router = Router();

loadFormsFromConfig();

app.use(router);

router.get('/', async function (_req, res) {
  res.send({ status: 'ok' });
});

app.use('/', formDefinitionRouter);

app.use('/', formInstanceRouter);

app.use(errorHandler);
