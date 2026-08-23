import { describe, expect, it, vi } from 'vitest';
import {
  assertTestDatabaseIdentity,
  resolveDatabaseConnectionString,
  TEST_DATABASE_NAME,
  TEST_DATABASE_USER,
} from '../server/db/index';
import { cleanDb } from './setup';

const isolatedTestUrl =
  `postgresql://${TEST_DATABASE_USER}:safe-password@example.test/` +
  TEST_DATABASE_NAME;
const developmentUrl = 'postgresql://development:password@example.test/heliumdb';

describe('Aislamiento de base de datos de tests', () => {
  it('falla inmediatamente si falta TEST_DATABASE_URL', () => {
    expect(() =>
      resolveDatabaseConnectionString({
        NODE_ENV: 'test',
        DATABASE_URL: developmentUrl,
      }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it('rechaza una URL de tests igual a DATABASE_URL', () => {
    expect(() =>
      resolveDatabaseConnectionString({
        NODE_ENV: 'test',
        DATABASE_URL: developmentUrl,
        TEST_DATABASE_URL: developmentUrl,
      }),
    ).toThrow(/must not be the same as DATABASE_URL/);
  });

  it('rechaza una URL que no apunta a la base y rol aislados', () => {
    expect(() =>
      resolveDatabaseConnectionString({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://wrong-user:password@example.test/wrong-db',
      }),
    ).toThrow(/must target/);
  });

  it('acepta solo la URL de tests esperada', () => {
    expect(
      resolveDatabaseConnectionString({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: isolatedTestUrl,
      }),
    ).toBe(isolatedTestUrl);
  });

  it('rechaza una identidad SQL distinta a la base esperada', () => {
    expect(() =>
      assertTestDatabaseIdentity({
        currentDatabase: 'heliumdb',
        currentUser: TEST_DATABASE_USER,
      }),
    ).toThrow(/identity check failed/);
  });

  it('rechaza una identidad SQL distinta al rol esperado', () => {
    expect(() =>
      assertTestDatabaseIdentity({
        currentDatabase: TEST_DATABASE_NAME,
        currentUser: 'postgres',
      }),
    ).toThrow(/identity check failed/);
  });

  it('cleanDb no emite DELETE si la verificación de identidad falla', async () => {
    const query = vi.fn<(sql: string) => Promise<unknown>>();
    const verifyIdentity = vi.fn(async () => {
      throw new Error('test identity mismatch');
    });

    await expect(
      cleanDb({
        nodeEnv: 'test',
        verifyIdentity,
        query,
      }),
    ).rejects.toThrow('test identity mismatch');

    expect(query).not.toHaveBeenCalled();
  });
});