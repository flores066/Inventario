const nodemailer = require("nodemailer");

const gmailSender = process.env.GMAIL_SENDER || "";
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || "";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: gmailSender,
    pass: gmailAppPassword,
  },
});

function ensureMailConfigured() {
  if (!gmailSender || !gmailAppPassword) {
    const error = new Error("EMAIL_NOT_CONFIGURED");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

// Plantilla base con la identidad visual de Less Perfum (Negro carbón + Dorado)
function buildEmailLayout({
  preheader,
  eyebrow,
  title,
  contentHtml,
  footerNote,
}) {
  const year = new Date().getFullYear();
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0f0e0c;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e8e2d5;">
    <!-- Texto de vista previa oculto en la bandeja de entrada -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(preheader)}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0f0e0c;padding:32px 16px;">
      <tr>
        <td align="center">
          <!-- Contenedor principal -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#181613;border:1px solid #383024;border-radius:8px;overflow:hidden;">
            
            <!-- Encabezado de marca -->
            <tr>
              <td align="center" style="padding:32px 24px 24px 24px;border-bottom:1px solid #2a241b;background-color:#141210;">
                <p style="margin:0 0 6px 0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#c9a96e;">
                  ALTA PERFUMERÍA
                </p>
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:normal;letter-spacing:3px;color:#f5efe6;">
                  LESS PERFUMS
                </h1>
              </td>
            </tr>

            <!-- Cuerpo del mensaje -->
            <tr>
              <td style="padding:36px 32px;">
                <p style="margin:0 0 10px 0;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#c9a96e;font-weight:bold;">
                  ${escapeHtml(eyebrow)}
                </p>
                <h2 style="margin:0 0 20px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:normal;color:#ffffff;line-height:1.3;">
                  ${escapeHtml(title)}
                </h2>
                
                ${contentHtml}
              </td>
            </tr>

            <!-- Pie de página -->
            <tr>
              <td style="padding:24px 32px;background-color:#12100e;border-top:1px solid #2a241b;text-align:center;">
                <p style="margin:0 0 10px 0;font-size:12px;color:#8c8273;line-height:1.5;">
                  ${escapeHtml(footerNote)}
                </p>
                <p style="margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5c5449;">
                  © ${year} Less PerfumS · El perfume es la forma más íntima del lujo
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

async function sendEmail(to, subject, text, html) {
  ensureMailConfigured();
  try {
    await transporter.sendMail({
      from: `"Less Perfum" <${gmailSender}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("Error detallado de Gmail:", err.message);
    const error = new Error("GMAIL_SEND_FAILED");
    error.code = "GMAIL_SEND_FAILED";
    throw error;
  }
}

// 1. Código de verificación OTP
async function enviarCodigoVerificacion(destinatario, codigo) {
  const safeCode = escapeHtml(codigo);
  const html = buildEmailLayout({
    preheader: `Tu código de verificación de Less Perfums es ${codigo}`,
    eyebrow: "Verificación de cuenta",
    title: "Confirma tu identidad",
    contentHtml: `
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#cfc7b8;">
        Gracias por registrarte en <strong style="color:#f5efe6;">Less Perfums</strong>. Para activar tu cuenta y acceder a nuestra colección exclusiva, ingresa el siguiente código de seguridad:
      </p>

      <!-- Caja dorada con el código -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
        <tr>
          <td align="center" style="background-color:#211d18;border:1px solid #c9a96e;border-radius:6px;padding:22px 16px;">
            <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:#e5c585;display:inline-block;padding-left:10px;">
              ${safeCode}
            </span>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;line-height:1.6;color:#998f80;">
        Este código es válido durante los próximos <strong style="color:#d6c7ae;">15 minutos</strong>. Por tu seguridad, nunca compartas esta clave con terceros.
      </p>
    `,
    footerNote:
      "Si no intentaste crear una cuenta en Less Perfums, puedes ignorar este correo de forma segura.",
  });

  await sendEmail(
    destinatario,
    `${codigo} es tu código de verificación - Less Perfums`,
    `Tu código de verificación de Less Perfums es: ${codigo}. Vence en 15 minutos.`,
    html,
  );
}

// 2. Bienvenida tras registro exitoso
async function enviarCorreoRegistro(destinatario, nombreUsuario) {
  const safeName = escapeHtml(nombreUsuario);
  const html = buildEmailLayout({
    preheader: `Bienvenido a Less Perfums, ${nombreUsuario}. Tu cuenta ya está activa.`,
    eyebrow: "Membresía activada",
    title: `Bienvenido, ${safeName}`,
    contentHtml: `
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#cfc7b8;">
        Tu correo electrónico ha sido verificado con éxito. A partir de este momento formas parte del universo <strong style="color:#f5efe6;">Less Perfums</strong>.
      </p>
      <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#cfc7b8;">
        Ya puedes iniciar sesión con tus credenciales para explorar nuestras fragancias, gestionar tus pedidos y recibir atención personalizada.
      </p>

      <!-- Detalle decorativo -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #2e281f;padding-top:20px;">
        <tr>
          <td style="font-size:13px;color:#c9a96e;font-style:italic;font-family:Georgia,'Times New Roman',serif;">
            "Una fragancia es el recuerdo más duradero de tu presencia."
          </td>
        </tr>
      </table>
    `,
    footerNote:
      "Recibes este correo porque completaste tu registro en Less Perfums.",
  });

  await sendEmail(
    destinatario,
    "Bienvenido a Less Perfums · Tu cuenta está lista",
    `Hola, ${nombreUsuario}. Tu correo fue verificado y tu cuenta en Less Perfums está lista.`,
    html,
  );
}

// 3. Alerta de inicio de sesión
async function enviarCorreoInicioSesion(destinatario, nombreUsuario) {
  const safeName = escapeHtml(nombreUsuario);
  const fecha = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  const html = buildEmailLayout({
    preheader: `Nuevo inicio de sesión registrado en tu cuenta de Less Perfums.`,
    eyebrow: "Actividad de seguridad",
    title: "Nuevo inicio de sesión",
    contentHtml: `
      <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#cfc7b8;">
        Hola, <strong style="color:#f5efe6;">${safeName}</strong>. Te informamos que se ha registrado un nuevo acceso a tu cuenta de Less Perfums.
      </p>

      <!-- Tarjeta de detalles del acceso -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#211d18;border-left:3px solid #c9a96e;border-radius:4px;margin:0 0 22px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#998f80;">
              Fecha y hora del acceso
            </p>
            <p style="margin:0;font-size:14px;color:#f5efe6;font-weight:bold;">
              ${escapeHtml(fecha)} (Hora Colombia)
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0;font-size:13px;line-height:1.6;color:#998f80;">
        Si fuiste tú quien inició sesión, no necesitas realizar ninguna acción. Si no reconoces esta actividad, te recomendamos cambiar tu contraseña de inmediato.
      </p>
    `,
    footerNote: "Notificación automática de seguridad · Less Perfums.",
  });

  await sendEmail(
    destinatario,
    "Nuevo inicio de sesión detectado - Less Perfums",
    `Hola, ${nombreUsuario}. Se inició sesión en tu cuenta de Less Perfums el ${fecha}.`,
    html,
  );
}

module.exports = {
  enviarCodigoVerificacion,
  enviarCorreoRegistro,
  enviarCorreoInicioSesion,
};
