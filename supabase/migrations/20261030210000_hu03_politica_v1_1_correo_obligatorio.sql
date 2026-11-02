-- HU-03 (ZARU-3): publica la versión 1.1 de la política de datos, que hace obligatorio el correo electrónico.
-- La versión 1.0 no se modifica: las autorizaciones ya otorgadas conservan la versión que aceptó el titular.
-- Al aplicarla, la 1.1 queda vigente de inmediato y el registro de clientes deja de aceptar la 1.0.

insert into politicas_datos (version, titulo, contenido) values (
  '1.1',
  'Política de tratamiento de datos personales',
  $politica$# Política de tratamiento de datos personales · versión 1.1

**Responsable del tratamiento:** el establecimiento (car wash) afiliado a ZARU donde el titular registra su vehículo.
**Encargado del tratamiento:** ZARU Ecosystem, plataforma tecnológica que opera el servicio por cuenta del establecimiento.

## 1. Datos que se recogen
Nombre, número de celular, correo electrónico, placa y características del vehículo, e historial de servicios. El nombre, el número de celular y el correo electrónico son obligatorios: sin ellos no es posible completar el registro.

## 2. Finalidades
1. Registrar el ingreso del vehículo y prestar el servicio contratado.
2. Informar al titular el estado de su vehículo y avisarle cuando esté listo, entre otros medios por correo electrónico.
3. Conservar el historial de servicios del vehículo.
4. Enviar promociones del establecimiento, solo si el titular lo autoriza por separado.

## 3. Derechos del titular (artículo 8 de la Ley 1581 de 2012)
Conocer, actualizar y rectificar sus datos; solicitar prueba de esta autorización; ser informado del uso que se da a sus datos; revocar la autorización o pedir la supresión de sus datos cuando no exista un deber legal de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio.

## 4. Cómo ejercer los derechos
Directamente en el establecimiento o desde la aplicación del cliente final de ZARU. La solicitud se atiende en los plazos de los artículos 14 y 15 de la Ley 1581 de 2012 (10 días hábiles para consultas y 15 días hábiles para reclamos).

## 5. Seguridad
Los datos se transmiten cifrados (HTTPS) y se almacenan cifrados en reposo. Cada establecimiento solo accede a los datos de sus propios clientes.

## 6. Vigencia
Esta versión rige desde su publicación en la plataforma. La autorización se conserva como evidencia con la fecha, la hora y la versión aceptada.$politica$
);
