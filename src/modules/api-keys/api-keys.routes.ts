import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

const repo = new ApiKeysRepository();
const service = new ApiKeysService(repo);
const controller = new ApiKeysController(service);

export const apiKeysRouter = Router();

apiKeysRouter.use(authenticate);

apiKeysRouter.post('/', controller.create.bind(controller));
apiKeysRouter.get('/', controller.list.bind(controller));
apiKeysRouter.delete('/:id', controller.revoke.bind(controller));
