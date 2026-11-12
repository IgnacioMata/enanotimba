# Activar Kick en Enano Timba

1. Incorporá estos archivos al proyecto de `enanotimba.netlify.app`. Conservá `torneo.html` y cualquier otra ruta o archivo que ya publique el sitio. Si el proyecto tiene una configuración de Netlify, integrá los ajustes de compilación y Functions con los existentes. El archivo HTML por sí solo sirve para la vista local.
2. Ejecutá `database.sql` en la base PostgreSQL del proyecto. Usá una conexión con TLS para Netlify.
3. Configurá `DATABASE_URL`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_CHANNEL_ID` y `SESSION_SECRET` como variables del servidor para el despliegue. `KICK_CHANNEL_ID` es el identificador numérico del canal, no el identificador de la aplicación. Generá un `SESSION_SECRET` aleatorio de al menos 32 bytes. Netlify proporciona `URL` al servidor.
4. Publicá la compilación con las funciones. La aplicación en Kick ya apunta a `https://enanotimba.netlify.app/api/kick/callback` para el login y `https://enanotimba.netlify.app/api/kick/webhook` para el chat.
5. Corré `node subscribe-kick.mjs` en una terminal con las tres variables de Kick cargadas de forma segura. El script pide la suscripción a `chat.message.sent` y evita crearla si Kick informa que ya existe.
6. Probá iniciar sesión desde Comunidad. Mandá un mensaje en el chat del canal y verificá que aparezca en el ranking. Con la cuenta dueña del canal, asigná un tipeo de prueba a un usuario del ranking. Ingresá con ese usuario y comprobá el reclamo.

Guardá el Client Secret, la conexión PostgreSQL y la clave de sesión en las variables privadas del servidor. Compartí las credenciales con el administrador mediante un gestor de secretos.

[Variables de Netlify Functions](https://docs.netlify.com/build/functions/environment-variables/) · [Eventos de Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/events/introduction.md)
