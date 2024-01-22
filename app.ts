import { app } from 'mu';
import { ErrorRequestHandler } from 'express';
import Router from 'express-promise-router';
import { formDefinitionRouter } from './controllers/form-definitions';
import { formInstanceRouter } from './controllers/form-instances';
import { loadFormsFromConfig } from './services/forms-from-config';

const router = Router();

loadFormsFromConfig();

app.use(router);

router.get('/', async (_req, res) => {
  res.send({ status: 'ok' });
});

router.use('/', formDefinitionRouter);

router.use('/', formInstanceRouter);

const errorHandler: ErrorRequestHandler = function (err, req, res) {
  // custom error handler to have a default 500 error code instead of 400 as in the template
  res.status(err.status || 500);
  res.json({
    errors: [{ title: err.message }],
  });
};

router.use(errorHandler);
