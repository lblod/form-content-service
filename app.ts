import { app, errorHandler } from 'mu';
import Router from 'express-promise-router';
import { formDefinitionRouter } from './controllers/form-definitions';
import { formInstanceRouter } from './controllers/form-instances';
import { loadFormsFromConfig } from './domain/data-access/form-repository';

const router = Router();

loadFormsFromConfig();

app.use(router);

router.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

app.use('/', formDefinitionRouter);

app.use('/', formInstanceRouter);

app.use(errorHandler);
