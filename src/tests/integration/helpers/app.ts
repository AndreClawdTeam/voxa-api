import supertest from 'supertest';
import { createApp } from '../../../app';

export function createTestApp() {
  const app = createApp();
  return supertest(app);
}
