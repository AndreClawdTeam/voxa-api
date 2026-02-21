import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Voxa API',
      version: '1.0.0',
      description:
        'API REST de transcrição de áudio via faster-whisper. Converta arquivos de áudio em texto com alta precisão usando planos de assinatura flexíveis.',
      contact: {
        name: 'Voxa API Support',
        email: 'support@voxa.dev',
      },
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /auth/login',
        },
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'vxa_<hex>',
          description: 'API Key with format vxa_<64 hex chars>',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Transcription', description: 'Audio transcription' },
      { name: 'API Keys', description: 'API key management' },
      { name: 'Subscriptions', description: 'Subscription management' },
      { name: 'Dashboard', description: 'Customer dashboard' },
      { name: 'Admin', description: 'Admin-only endpoints' },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.controller.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
