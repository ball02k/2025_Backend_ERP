process.env.NODE_ENV = 'development';
process.env.ENABLE_DEV_AUTH = '1';
const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../index.cjs');

const prisma = new PrismaClient();

describe('Projects and Tasks CRUD', () => {
  let clientId;
  let statusId;
  let typeId;
  let taskStatusId;
  let projectId;
  let taskId;

  beforeAll(async () => {
    // Ensure lookup rows exist
    const ps = await prisma.projectStatus.create({ data: { key: 'active', label: 'Active' } }).catch(async () => {
      const s = await prisma.projectStatus.findFirst({ where: { key: 'active' } });
      return s;
    });
    statusId = ps.id;
    const pt = await prisma.projectType.create({ data: { key: 'general', label: 'General' } }).catch(async () => {
      const t = await prisma.projectType.findFirst({ where: { key: 'general' } });
      return t;
    });
    typeId = pt.id;
    const ts = await prisma.taskStatus.create({ data: { key: 'open', label: 'Open' } }).catch(async () => {
      const t = await prisma.taskStatus.findFirst({ where: { key: 'open' } });
      return t;
    });
    taskStatusId = ts.id;

    const client = await prisma.client.create({ data: { name: 'Acme Corp' } });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Create project', async () => {
    const code = 'P-' + Math.floor(Math.random()*1e9);
    const res = await request(app)
      .post('/api/projects')
      .send({ code, name: 'HQ Build', clientId, statusId, typeId })
      .expect(201);
    projectId = res.body.id;
    expect(res.body).toMatchObject({ code, name: 'HQ Build' });
  });

  test('List projects returns paging object', async () => {
    const res = await request(app).get('/api/projects?limit=10&offset=0').expect(200);
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  test('Create task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ projectId, title: 'Kickoff', statusId: taskStatusId })
      .expect(201);
    taskId = res.body.id;
    expect(res.body).toHaveProperty('projectId', projectId);
  });

  test('Update task', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ description: 'Kickoff meeting' })
      .expect(200);
    expect(res.body).toHaveProperty('description', 'Kickoff meeting');
  });

  test('Soft delete task', async () => {
    await request(app).delete(`/api/tasks/${taskId}`).expect(204);
    await request(app).get(`/api/tasks/${taskId}`).expect(404);
  });

  test('Soft delete project', async () => {
    await request(app).delete(`/api/projects/${projectId}`).expect(204);
    await request(app).get(`/api/projects/${projectId}`).expect(404);
  });
});
