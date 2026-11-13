# dsh-plugin-balance

Plugin para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) que muestra el **saldo disponible de tu cuenta DeepSeek** en la barra inferior del chat, al lado de los indicadores de `tok/s`, *cache hit* y contexto.

```
  2.06 USD      ← este plugin
  18 tok/s · Cache hit 92% · 34% contexto
```

El importe sale del mismo dato que ves en <https://platform.deepseek.com/usage>: el plugin pide al Host el balance del wallet de la cuenta con la que ya iniciaste sesión en Harness. No hace falta API key y el token de la cuenta nunca llega al navegador.

- Se actualiza **cada 60 s**, y también al volver el foco a la ventana o al abrir una sesión nueva.
- Sin sesión de DeepSeek iniciada no muestra nada (se oculta en lugar de inventar un cero).
- El tooltip muestra el desglose: saldo total, saldo recargado y saldo bonificado.
- Si la lectura falla, conserva el último importe conocido.

### Detalles de formato

| Caso | Salida |
|---|---|
| Saldo normal | `2.06 USD` |
| Saldo inferior a un centavo | `<0.01 USD` |
| Saldo negativo | `-0.01 USD` |
| Sin divisa conocida | no se muestra |

Si el wallet tuviera más de una divisa, el pill muestra la primera que devuelve el servidor (`CNY` y `USD` son las admitidas por el contrato de la plataforma); el desglose completo sigue estando en el tooltip de cada divisa activa.

## Cómo se instala

Es un *bundle* de DSH: un paquete npm con `dsh.bundle.patch` (la fila de plugin) y `dsh.client` (el bundle del navegador). Se instala como cualquier otro bundle del perfil.

### Opción A — desde la página de Plugins (recomendada)

1. Copiá o cloná este repo en una carpeta local.
2. En Harness: **Plugins → Browse other plugins → instalar desde ruta local**, apuntando a la carpeta del repo.
3. El cambio se aplica en caliente; si tu perfil no tiene HMR, reiniciá la app.

### Opción B — manual (lo que hizo este repo la primera vez)

En `$DSH_HOME/profiles/<perfil>/`:

1. Enlazá el paquete para que el especificador resuelva:
   ```powershell
   New-Item -ItemType Junction -Path "node_modules\dsh-plugin-balance" -Target "C:\ruta\al\repo"
   ```
2. En `package.json`, agregá la dependencia y el bundle (al final, para que gane precedencia):
   ```json
   {
     "dependencies": { "dsh-plugin-balance": "link:C:/ruta/al/repo" },
     "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-plugin-balance"] } }
   }
   ```
3. Reiniciá Harness (o esperá el *recompose* de HMR).

Para desinstalarlo: quitá la entrada de `dsh.profile.bundles`, borrá el enlace de `node_modules` y reiniciá.

## Cómo está hecho

| Archivo | Rol |
|---|---|
| `index.js` | Mitad Host: `apply()` vacío; el bundle del navegador hace todo el trabajo. |
| `client.js` | Módulo del navegador: registra el pill en el slot `conversation.composer.dock` (orden 2, después de `activity` y `usage`) y consulta `ctx.remote.account.getBalance(...)`. |
| `cordis.patch.yml` | Fila del plugin que inserta el bundle en el perfil. |
| `locale/{en,zh}.json` | Título y descripción para el gestor de plugins. |
| `icon.svg` | Icono del bundle (wallet). |

El pill reutiliza la geometría de los pills hermanos (`StatsPills`): `--dsw-radius-sm`, `--dsw-alias-label-tertiary`, iconos de 14 px y cifras tabulares, así que hereda el tema claro/oscuro sin estilos propios de color.

Consulta `account.getBalance` con la identidad de cliente que pide la plataforma (`version`, `locale`, `timezoneOffsetSeconds`) y sumá los wallets normales y bonificados por divisa. El refresco vive en un `useEffect` que limpia intervalo y listeners al desmontar.

## Verificación

```powershell
node --check client.js
node --check index.js
node test/smoke-test.mjs
```

El *smoke test* carga `client.js` con un `window.__ModuleLoader__` falso, ejecuta `apply()`, verifica el slot registrado y renderiza el pill contra un `getBalance` mockeado: espera exactamente `2.06 USD` y un tooltip con el desglose.

## Licencia

MIT — ver [LICENSE](LICENSE).
