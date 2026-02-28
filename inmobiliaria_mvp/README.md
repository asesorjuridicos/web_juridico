# Asesores Inmobiliario MVP

Proyecto paralelo para la futura web `asesoresinmobiliario.com.ar`.

## Que incluye

- sitio publico con home, buscador y propiedades destacadas
- backend minimo en Node sin dependencias externas
- formulario de consultas con anti-spam basico
- panel admin inicial para propiedades y consultas
- persistencia en archivos JSON para avanzar rapido

## Como levantarlo

```bash
cd inmobiliaria_mvp
npm start
```

Abre:

- sitio publico: `http://127.0.0.1:5600`
- admin: `http://127.0.0.1:5600/admin/`

## Variables opcionales

```bash
PORT=5600
ADMIN_USER=admin
ADMIN_PASSWORD=cambiar-esto
```

Si no defines credenciales, el MVP usa:

- usuario: `admin`
- clave: `inmo2026!`

## Alcance de este MVP

Esta base sirve para validar diseno, carga de propiedades y recepcion de consultas.
Para produccion conviene mover:

- propiedades e inbox a una base de datos
- imagenes a un storage dedicado
- login admin a sesiones persistentes o auth real
- formularios a Turnstile o hCaptcha
- logs y alertas de spam a una herramienta externa

## Proximos pasos recomendados

1. registrar `asesoresinmobiliario.com.ar` a tu nombre
2. definir imagenes reales de propiedades
3. conectar mail saliente y WhatsApp
4. endurecer seguridad del admin
5. migrar a una base de datos antes de publicar fuerte
