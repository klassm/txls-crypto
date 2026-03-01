FROM ghcr.io/klassm/txls-crypto:1.0.13

RUN apk add --no-cache nginx

COPY run-hass.sh /run-hass.sh
RUN chmod a+x /run-hass.sh

EXPOSE 8080

CMD ["/run-hass.sh"]
