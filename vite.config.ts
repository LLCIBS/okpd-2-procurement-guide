import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import {defineConfig, loadEnv} from 'vite';
import { resolveGeminiProxyUrl } from './src/server/geminiProxy';
import { readJsonBody, runTenderSearch } from './src/server/tenderSearchApi';

function tenderSearchDevPlugin(env: Record<string, string>): Plugin {
  const apiKey = env.GEMINI_API_KEY;
  let proxyUrl: string | undefined;
  try {
    proxyUrl = resolveGeminiProxyUrl(env);
  } catch (e) {
    console.error('[tender-search] ошибка разбора GEMINI_PROXY / прокси-URL:', e);
    throw e;
  }

  return {
    name: 'tender-search-dev-api',
    configureServer(server) {
      console.log(
        '[tender-search] Dev API: POST /api/tender-search — этапы поиска закупок логируются ниже с префиксом [tender-search …]'
      );
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/tender-search') || req.method !== 'POST') {
          return next();
        }
        try {
          const raw = await readJsonBody(req);
          const body = JSON.parse(raw) as {
            query?: string;
            lawFilter?: { law44?: boolean; law223?: boolean };
            platformFilter?: { eis?: boolean; sberAst?: boolean };
          };
          const query = body.query ?? '';
          const tenders = await runTenderSearch(query, apiKey ?? '', body.lawFilter, body.platformFilter, proxyUrl);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ tenders }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('[tender-search] ошибка обработки запроса:', e);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: msg }));
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), tenderSearchDevPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      allowedHosts: ['terminally-gallant-constrictor.cloudpub.ru'],
    },
  };
});
