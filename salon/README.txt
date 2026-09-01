FiestaControl V14 - Mensajes y avisos en pedidos

Cambios:
- El salón ve un contador rojo en Proveedores cuando tiene respuestas nuevas.
- El salón ve aviso de mensaje nuevo en la barra superior y en el Dashboard.
- El proveedor ve contador rojo en Pedidos y mensajes cuando un salón escribe o genera un pedido.
- Los pedidos con novedades muestran MENSAJE NUEVO.
- Al abrir el seguimiento, la novedad se marca como leída para ese usuario.
- La sincronización entre pestañas continúa funcionando sin F5 en esta demo local.

Acceso inicial de Super Admin (si la base local está limpia):
admin@fiestacontrol.com
admin123


FIESTACONTROL V18 - BASE LIMPIA Y ALTAS REMOTAS
===============================================
Esta carpeta NO incluye fiestacontrol.db. La primera vez que se inicia el servidor se crea una base nueva, vacia.
El unico usuario inicial es:
  admin@fiestacontrol.com / admin123

IMPORTANTE PARA OTRAS PCs
-------------------------
- En la PC servidor ejecutar INICIAR_FIESTACONTROL.bat.
- En las otras PCs NO abrir index.html.
- Entrar siempre a http://IP-DEL-SERVIDOR:8080
- El alta de Salon y Proveedor se guarda directamente en el servidor central.
- El Super Admin actualiza Solicitudes automaticamente, sin F5.

PRUEBA RAPIDA
-------------
1) En servidor entrar al Admin y abrir Solicitudes.
2) En otra PC entrar a http://IP-DEL-SERVIDOR:8080 y registrar un salon.
3) Debe aparecer como Pendiente en el Admin.
4) Repetir con un proveedor.
5) Desde la PC cliente abrir http://IP-DEL-SERVIDOR:8080/api/status y comprobar que salons/providers aumentan.


V19: Las invitaciones tienen boton directo de confirmacion. La URL publica se genera automaticamente con la IP LAN del servidor cuando se abre localmente, y con el dominio/HTTPS cuando se publica detras de un proxy que reenvia Host y X-Forwarded-Proto.
