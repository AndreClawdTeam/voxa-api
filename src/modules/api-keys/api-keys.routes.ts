import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

const repo = new ApiKeysRepository();
const service = new ApiKeysService(repo);
const controller = new ApiKeysController(service);

export const apiKeysRouter = Router();

/**
 * @swagger
 * tags:
 *   name: API Keys
 *   description: Manage API keys for authentication
 */

apiKeysRouter.use(authenticate);

/**
 * @swagger
 * /keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Generate a new API key
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *             properties:
 *               label:
 *                 type: string
 *                 example: My Production Key
 *     responses:
 *       201:
 *         description: API key created. The rawToken is shown only once.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *                     rawToken:
 *                       type: string
 *                       description: "Full API key — shown only once. Format: vxa_<64 hex chars>"
 *       401:
 *         description: Unauthorized
 */
apiKeysRouter.post('/', controller.create.bind(controller));

/**
 * @swagger
 * /keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List all API keys for the current user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys (without raw token values)
 *       401:
 *         description: Unauthorized
 */
apiKeysRouter.get('/', controller.list.bind(controller));

/**
 * @swagger
 * /keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke an API key
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked
 *       403:
 *         description: Key does not belong to user
 *       401:
 *         description: Unauthorized
 */
apiKeysRouter.delete('/:id', controller.revoke.bind(controller));
