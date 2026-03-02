FROM ghcr.io/klassm/txls-crypto:1.0.21

RUN apk add --no-cache curl

COPY run-hass.sh /run-hass.sh
RUN chmod a+x /run-hass.sh

EXPOSE 3000

CMD ["/run-hass.sh"]
