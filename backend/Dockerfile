# KEYMART API: PHP 8.3 + Apache. Built from the backend/ folder (Render: Root Directory = backend).
FROM php:8.3-apache

# PORT: Render injects its own (10000); everywhere else the default is 80.
ENV PORT=80 \
    APACHE_DOCUMENT_ROOT=/var/www/html/public

RUN apt-get update \
    && apt-get install -y --no-install-recommends git unzip libzip-dev \
    && docker-php-ext-install pdo_mysql zip opcache \
    && a2enmod rewrite headers \
    && sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/000-default.conf \
    && sed -ri 's!AllowOverride None!AllowOverride All!g' /etc/apache2/apache2.conf \
    && sed -ri 's!^Listen 80$!Listen ${PORT}!' /etc/apache2/ports.conf \
    && sed -ri 's!<VirtualHost \*:80>!<VirtualHost *:${PORT}>!' /etc/apache2/sites-available/000-default.conf \
    && printf 'ServerName localhost\nServerTokens Prod\nServerSignature Off\n' > /etc/apache2/conf-available/keymart.conf \
    && a2enconf keymart \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Dependencies first, so the layer is cached until composer.json/lock change. No dev packages in the image.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --prefer-dist --optimize-autoloader

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Source is bind-mounted in development (the entrypoint then installs dependencies itself); copied in for production builds.
COPY . /var/www/html
RUN composer dump-autoload --no-dev --optimize --no-interaction \
    && chown -R www-data:www-data /var/www/html/public

EXPOSE 80

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["apache2-foreground"]
