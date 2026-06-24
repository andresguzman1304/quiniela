# Quiniela

App de quinielas (prediction pools) construida con Vite + React + TypeScript y Supabase.

Pools de predicciones de fútbol con tabla de posiciones, scoring y panel de organizador. Diseñada con un registro de plugins para soportar otros tipos de pools en el futuro.

## Stack

- **Frontend:** Vite, React 18, TypeScript, Tailwind CSS, React Router, TanStack Query
- **Backend:** Supabase (Postgres, RLS, RPCs)
- **Hosting:** Vercel

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # llena con tus credenciales de Supabase
npm run dev
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Type-check + build de producción |
| `npm run preview` | Previsualiza el build |
| `npm run gen:types` | Genera tipos TypeScript desde Supabase |

## Deploy

Conectado a Vercel con auto-deploy: cada `push` a `main` despliega a producción; otras ramas generan previews.

Producción: https://quiniela-silk.vercel.app
