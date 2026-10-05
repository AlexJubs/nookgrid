import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createStreakService,ServiceError} from './streak-service.mjs';
import {appleVerifier} from './attestation.mjs';

export function httpServer(service) {
  const limits = new Map();
  const server = createServer(async (request,response) => {
    response.setHeader('Content-Type','application/json');
    response.setHeader('Cache-Control','no-store');
    try {
      const now = Date.now(), address = request.socket.remoteAddress;
      const limit = limits.get(address);
      if (!limit || limit.until < now) limits.set(address,{until:now+60_000,count:1});
      else if (++limit.count > 120) throw new ServiceError('rate_limited',429);
      if (limits.size > 10_000) for (const [ip,item] of limits) if (item.until < now) limits.delete(ip);
      const action = {'/v1/challenge':'challenge','/v1/enroll':'enroll','/v1/sync':'sync'}[request.url];
      if (request.method !== 'POST' || !action) throw new ServiceError('not_found',404);
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new ServiceError('invalid_content_type',415);
      let body = ''; for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 150_000) throw new ServiceError('too_large',413); }
      let input; try { input = JSON.parse(body); } catch { throw new ServiceError('invalid_json'); }
      const result = service[action](input);
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error instanceof ServiceError ? error.status : 500;
      response.end(JSON.stringify({error:error instanceof ServiceError ? error.message : 'service_unavailable'}));
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return server;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const database = process.env.NOOKGRID_STREAK_DATABASE;
  if (!database || !process.env.NOOKGRID_STREAK_SIGNING_KEY_FILE) throw Error('Persistent database and private signing key file required');
  await mkdir(dirname(resolve(database)),{recursive:true,mode:0o700});
  const service = createStreakService({database,signingKey:await readFile(process.env.NOOKGRID_STREAK_SIGNING_KEY_FILE),verifier:appleVerifier({teamIdentifier:process.env.NOOKGRID_APPLE_TEAM_ID}),bank:JSON.parse(await readFile(new URL('../public/puzzles.json',import.meta.url)))});
  // Bind behind a TLS reverse proxy; never serve repository files here.
  const server = httpServer(service);
  server.listen(Number(process.env.PORT || 8787),process.env.NOOKGRID_STREAK_BIND || '127.0.0.1',() => console.log('Streak verification service listening'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => server.close(() => { service.close(); process.exit(0); }));
}
