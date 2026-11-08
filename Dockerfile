FROM caddy:2.11-alpine

# Статический сайт без сборки — копируем как есть.
COPY index.html /usr/share/caddy/index.html
COPY css/ /usr/share/caddy/css/
COPY js/ /usr/share/caddy/js/
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
