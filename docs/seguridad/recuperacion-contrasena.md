# Recuperación de contraseña (HU-14)

Esta historia usa el flujo oficial de **Supabase Auth**. El frontend nunca maneja la
clave secreta del proyecto ni crea un sistema propio de recuperación.

## 1. Variables de entorno

Solo se usan las que ya existen en `frontend/.env`:

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-pública>
```

La `anon key` es pública y está protegida por RLS. **No** agregues
`SUPABASE_SERVICE_ROLE_KEY` al frontend.

## 2. URL de redirección

En Supabase: **Authentication → URL Configuration**.

1. **Site URL**: la URL del panel en producción (por ejemplo
   `https://panel.zaru.com`).
2. **Redirect URLs**: agrega una entrada por cada ambiente, terminando en
   `/restablecer`:

   ```text
   http://localhost:5173/restablecer
   https://<dominio-de-produccion>/restablecer
   ```

La aplicación arma el destino con `window.location.origin + '/restablecer'`.
Si la URL no está en la lista permitida, Supabase redirige al `Site URL` y el
enlace de recuperación no llega a la pantalla correcta.

## 3. Plantilla del correo

En Supabase: **Authentication → Email Templates → Reset Password**.

- Asunto sugerido: `Restablece tu contraseña de Zaru`.
- Cuerpo sugerido, manteniendo `{{ .ConfirmationURL }}`:

  ```html
  <h2>Restablece tu contraseña de Zaru</h2>
  <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
  <p>
    <a href="{{ .ConfirmationURL }}">Crear una nueva contraseña</a>
  </p>
  <p>El enlace tiene vigencia limitada y solo puede usarse una vez.</p>
  <p>Si no solicitaste este cambio, ignora este correo.</p>
  ```

`{{ .ConfirmationURL }}` es la URL que Supabase genera con el token y el
`redirect_to`; no la reemplaces por una URL fija.

## 4. Vigencia y un solo uso

- La vigencia se configura en **Authentication → Providers → Email →
  Email OTP Expiration** (por defecto 3600 segundos).
- Supabase invalida el token después de usarlo. Si el enlace vence o ya fue
  usado, la redirección trae `#error_code=...` y la pantalla
  `/restablecer` muestra el aviso de enlace no válido con la opción de
  solicitar uno nuevo.
- Para producción, configura un proveedor SMTP propio en
  **Authentication → Emails**; el envío por defecto tiene límites bajos.

## 5. Flujo implementado

1. Login → enlace **¿Olvidaste tu contraseña?** → `/recuperar`.
2. `/recuperar` valida el correo y llama a
   `supabase.auth.resetPasswordForEmail(correo, { redirectTo })`.
3. El mensaje de confirmación es siempre el mismo, exista o no la cuenta
   (CA2).
4. El correo lleva a `/restablecer#access_token=...&type=recovery`.
5. El `SesionProvider` detecta `PASSWORD_RECOVERY`, mantiene esa sesión
   separada de una sesión normal y evita consultar `/me` o abrir el panel.
6. `/restablecer` valida la nueva contraseña y su confirmación, y ejecuta
   `supabase.auth.updateUser({ password })`.
7. Al guardar, se cierra la sesión temporal y se pide iniciar sesión con la
   contraseña nueva.

## 6. Pasos de prueba manual

1. Con un correo registrado, solicita la recuperación y confirma que llega el
   correo.
2. Repite con un correo no registrado y verifica que el mensaje en pantalla es
   idéntico.
3. Abre el enlace del correo y cambia la contraseña.
4. Intenta abrir el mismo enlace otra vez: debe mostrarse el aviso de enlace
   no válido.
5. Espera a que venza el enlace (o reduce `Email OTP Expiration`) e inténtalo:
   debe rechazarse con la opción de solicitar uno nuevo.
6. En la pantalla de restablecimiento, prueba contraseñas que no coincidan y
   una que no cumpla la política (mínimo 8 caracteres, una letra y un número).
7. Inicia sesión con la contraseña nueva y verifica que ya no se puede usar la
   anterior.
