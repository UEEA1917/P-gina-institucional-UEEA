
/* ==========================================
   CONFIGURACIÓN DE SUPABASE
========================================== */

const SUPABASE_URL = "https://bxmqptbasokwpdgozhjo.supabase.co";
const SUPABASE_KEY = "sb_publishable_-TmoGNTbptpNhz6tWMBUzw_VHuHavi5";

const ADMIN_UID = "5ec62554-ecf3-4b2f-8167-8e7ada4ebd42";

const BUCKET = "event-images";
const STORAGE_KEY = "eloyAlfaro_eventos_v1";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_DETAIL_IMAGES = 5;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

const eventsGrid = $("eventsGrid");
const manageEvents = $("manageEvents");
const eventForm = $("eventForm");

let isAdmin = false;
let events = [];
let selectedEventImage = "";
let selectedDetailImages = [];

const eventImageInput = $("eventImage");
const eventImagePreview = $("eventImagePreview");
const eventImagePreviewImg = $("eventImagePreviewImg");
const removeEventImageBtn = $("removeEventImageBtn");

const detailImagesInput = $("detailImages");
const detailImagesPreview = $("detailImagesPreview");

/* ==========================================
   IMÁGENES Y SUPABASE STORAGE
========================================== */

function compressImage(file, maxDimension = 1100, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          const scale = Math.min(
            maxDimension / width,
            maxDimension / height
          );

          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("No se pudo procesar la imagen."));
          return;
        }

        context.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.src = String(reader.result || "");
    };

    reader.readAsDataURL(file);
  });
}

/* Sube una imagen a Supabase si todavía es base64 */

async function uploadImage(image) {
  if (!image) return "";

  if (!image.startsWith("data:")) {
    return image;
  }

  const response = await fetch(image);
  const blob = await response.blob();

  const fileName = `${crypto.randomUUID()}.jpg`;

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(fileName, blob, {
      contentType: "image/jpeg",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}

/* ==========================================
   VISTA PREVIA DE IMAGEN PRINCIPAL
========================================== */

function showEventImagePreview(imageData) {
  selectedEventImage = imageData || "";

  if (!eventImagePreview || !eventImagePreviewImg) return;

  eventImagePreview.hidden = !selectedEventImage;

  if (selectedEventImage) {
    eventImagePreviewImg.src = selectedEventImage;
  } else {
    eventImagePreviewImg.removeAttribute("src");
  }
}

if (eventImageInput) {
  eventImageInput.addEventListener("change", async () => {
    const file = eventImageInput.files?.[0];

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("Formato no válido. Selecciona JPG, PNG o WEBP.");
      eventImageInput.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      alert("La imagen supera los 5 MB.");
      eventImageInput.value = "";
      return;
    }

    try {
      const compressed = await compressImage(file);
      showEventImagePreview(compressed);
    } catch (error) {
      alert(error.message);
      eventImageInput.value = "";
    }
  });
}

if (removeEventImageBtn) {
  removeEventImageBtn.addEventListener("click", () => {
    showEventImagePreview("");

    if (eventImageInput) {
      eventImageInput.value = "";
    }
  });
}

/* ==========================================
   IMÁGENES ADICIONALES
========================================== */

function renderDetailImagePreview() {
  if (!detailImagesPreview) return;

  detailImagesPreview.innerHTML = selectedDetailImages
    .map((image, index) => `
      <div class="detail-image-item">
        <img src="${escapeHTML(image)}"
             alt="Imagen adicional ${index + 1}">

        <button type="button"
                data-remove-detail-image="${index}">
          Quitar imagen
        </button>
      </div>
    `)
    .join("");
}

if (detailImagesInput) {
  detailImagesInput.addEventListener("change", async () => {
    const files = Array.from(detailImagesInput.files || []);

    if (!files.length) return;

    if (selectedDetailImages.length + files.length > MAX_DETAIL_IMAGES) {
      alert("Puedes agregar un máximo de 5 imágenes adicionales.");
      detailImagesInput.value = "";
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        alert("Solo se permiten imágenes JPG, PNG y WEBP.");
        detailImagesInput.value = "";
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        alert(`La imagen "${file.name}" supera los 5 MB.`);
        detailImagesInput.value = "";
        return;
      }
    }

    detailImagesInput.disabled = true;

    try {
      const compressed = await Promise.all(
        files.map(file => compressImage(file, 1000, 0.65))
      );

      selectedDetailImages.push(...compressed);
      renderDetailImagePreview();
    } catch (error) {
      alert("No se pudieron procesar las imágenes.");
    } finally {
      detailImagesInput.disabled = false;
      detailImagesInput.value = "";
    }
  });

  detailImagesPreview.addEventListener("click", event => {
    const button = event.target.closest(
      "button[data-remove-detail-image]"
    );

    if (!button) return;

    const index = Number(button.dataset.removeDetailImage);

    if (index >= 0 && index < selectedDetailImages.length) {
      selectedDetailImages.splice(index, 1);
      renderDetailImagePreview();
    }
  });
}

/* ==========================================
   CONVERTIR DATOS DE SUPABASE
========================================== */

function rowToEvent(row) {
  return {
    id: String(row.id),
    title: row.title || "",
    date: row.date || "",
    time: row.time || "",
    place: row.place || "",
    description: row.description || "",
    image: row.image || "",
    details: row.details || "",
    detailImages: Array.isArray(row.detailsimagen)
      ? row.detailsimagen
      : []
  };
}

function eventToRow(event) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    place: event.place,
    description: event.description,
    image: event.image,
    details: event.details,
    detailsimagen: event.detailImages
  };
}

/* ==========================================
   MIGRAR EVENTOS DEL NAVEGADOR A LA NUBE
========================================== */

async function migrateLocalEvents() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) return;

  let oldEvents;

  try {
    oldEvents = JSON.parse(saved);
  } catch (error) {
    console.error("No se pudieron leer los eventos antiguos.", error);
    return;
  }

  if (!Array.isArray(oldEvents) || oldEvents.length === 0) return;

  const { data, error } = await supabaseClient
    .from("eventos")
    .select("id")
    .limit(1);

  if (error) throw error;

  if (data.length > 0) return;

  for (const oldEvent of oldEvents) {
    const event = {
      id: String(oldEvent.id),
      title: oldEvent.title || "",
      date: oldEvent.date,
      time: oldEvent.time || "",
      place: oldEvent.place || "",
      description: oldEvent.description || "",
      image: await uploadImage(oldEvent.image || ""),
      details: oldEvent.details || "",
      detailImages: await Promise.all(
        (Array.isArray(oldEvent.detailImages)
          ? oldEvent.detailImages
          : []
        ).map(uploadImage)
      )
    };

    const { error: insertError } = await supabaseClient
      .from("eventos")
      .insert(eventToRow(event));

    if (insertError) throw insertError;
  }

  console.log("Eventos antiguos migrados a Supabase.");
}

/* ==========================================
   CARGAR EVENTOS DESDE SUPABASE
========================================== */

async function loadEvents() {
  try {
    await migrateLocalEvents();

    const { data, error } = await supabaseClient
      .from("eventos")
      .select("*")
      .order("date", { ascending: true });

    if (error) throw error;

    events = data.map(rowToEvent);

    renderEvents();

    if (isAdmin) {
      renderManageEvents();
    }

  } catch (error) {
    console.error("Error cargando eventos:", error);

    alert(
      "No se pudieron cargar los eventos. Revisa tu conexión con Supabase."
    );
  }
}

/* ==========================================
   SEGURIDAD AL MOSTRAR TEXTO
========================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* ==========================================
   FECHAS
========================================== */

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateString) {
  return parseLocalDate(dateString).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function getToday() {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function sortEvents(list) {
  return [...list].sort((a, b) => {
    const dateA = `${a.date}T${a.time || "00:00"}`;
    const dateB = `${b.date}T${b.time || "00:00"}`;

    return dateA.localeCompare(dateB);
  });
}

/* ==========================================
   MOSTRAR Y BUSCAR EVENTOS
========================================== */

function renderEvents() {
  const query = $("searchInput").value.trim().toLowerCase();
  const filter = $("filterSelect").value;
  const today = getToday();

  const filtered = sortEvents(events).filter(event => {
    const text = [
      event.title,
      event.place,
      event.description,
      event.details || "",
      event.date
    ].join(" ").toLowerCase();

    const matchesSearch = text.includes(query);
    const isPast = event.date < today;

    const matchesFilter =
      filter === "todos" ||
      (filter === "proximos" && !isPast) ||
      (filter === "pasados" && isPast);

    return matchesSearch && matchesFilter;
  });

  $("eventCount").textContent =
    `${filtered.length} ${filtered.length === 1 ? "evento" : "eventos"}`;

  $("emptyMessage").hidden = filtered.length !== 0;

  eventsGrid.innerHTML = filtered.map(event => {
    const isPast = event.date < today;

    const imageHTML = event.image
      ? `<img class="event-card-image"
              src="${escapeHTML(event.image)}"
              alt="Imagen del evento ${escapeHTML(event.title)}"
              loading="lazy">`
      : "";

    return `
      <article class="event-card">
        ${imageHTML}

        <div class="card-top">
          <span class="date-label">
            ${escapeHTML(formatDate(event.date))}
          </span>

          <h3>${escapeHTML(event.title)}</h3>
        </div>

        <div class="card-body">
          <span class="status ${isPast ? "past" : ""}">
            ${isPast ? "Evento anterior" : "Evento programado"}
          </span>

          <div class="card-detail">
            🕒 ${escapeHTML(event.time)} ·
            ${escapeHTML(formatDate(event.date))}
          </div>

          <div class="card-detail">
            📍 ${escapeHTML(event.place)}
          </div>

          <div class="card-description">
            ${escapeHTML(event.description)}
          </div>

          <button type="button"
                  class="btn-details"
                  data-action="details"
                  data-id="${escapeHTML(event.id)}">
            Ver detalles →
          </button>
        </div>
      </article>
    `;
  }).join("");
}

/* ==========================================
   VENTANA DE DETALLES
========================================== */

function openDetailsModal(selected) {
  $("detailsModalTitle").textContent = selected.title;

  $("detailsModalMeta").textContent =
    `${formatDate(selected.date)} · ${selected.time} · ${selected.place}`;

  $("detailsModalDescription").textContent =
    selected.description || "";

  $("detailsModalText").textContent =
    selected.details || "No hay detalles adicionales publicados.";

  const allImages = [
    ...(selected.image ? [selected.image] : []),
    ...(Array.isArray(selected.detailImages)
      ? selected.detailImages
      : [])
  ];

  $("detailsImagesSection").hidden = allImages.length === 0;

  $("detailsModalImages").innerHTML = allImages.map((image, index) => `
    <img src="${escapeHTML(image)}"
         alt="Imagen ${index + 1} de ${escapeHTML(selected.title)}"
         loading="lazy">
  `).join("");

  $("detailsModal").hidden = false;
  document.body.style.overflow = "hidden";

  $("closeDetailsBtn").focus();
}

function closeDetailsModal() {
  $("detailsModal").hidden = true;
  document.body.style.overflow = "";
}

eventsGrid.addEventListener("click", event => {
  const button = event.target.closest(
    'button[data-action="details"]'
  );

  if (!button) return;

  const selected = events.find(
    item => item.id === button.dataset.id
  );

  if (selected) openDetailsModal(selected);
});

$("closeDetailsBtn").addEventListener("click", closeDetailsModal);

$("detailsModal").addEventListener("click", event => {
  if (event.target.id === "detailsModal") {
    closeDetailsModal();
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("detailsModal").hidden) {
    closeDetailsModal();
  }
});

/* ==========================================
   ADMINISTRACIÓN DE EVENTOS
========================================== */

function renderManageEvents() {
  if (!isAdmin) return;

  const ordered = sortEvents(events);

  if (ordered.length === 0) {
    manageEvents.innerHTML = "<p>Aún no hay eventos publicados.</p>";
    return;
  }

  manageEvents.innerHTML = ordered.map(event => `
    <article class="manage-item">
      <div>
        <h4>${escapeHTML(event.title)}</h4>

        <p>
          ${escapeHTML(formatDate(event.date))} ·
          ${escapeHTML(event.time)} ·
          ${escapeHTML(event.place)}
        </p>

        ${event.image ? "<p>🖼️ Tiene imagen principal</p>" : ""}

        ${event.detailImages.length
          ? `<p>🖼️ ${event.detailImages.length} imágenes adicionales</p>`
          : ""}

        ${event.details ? "<p>✓ Tiene detalles adicionales</p>" : ""}
      </div>

      <div class="manage-actions">
        <button class="btn-small"
                data-action="edit"
                data-id="${escapeHTML(event.id)}"
                type="button">
          Editar
        </button>

        <button class="btn-small btn-delete"
                data-action="delete"
                data-id="${escapeHTML(event.id)}"
                type="button">
          Eliminar
        </button>
      </div>
    </article>
  `).join("");
}

/* ==========================================
   INICIO DE SESIÓN CON SUPABASE
========================================== */

/* Agregar campo de correo al formulario existente */

const emailInput = document.createElement("input");

emailInput.type = "email";
emailInput.id = "adminEmail";
emailInput.placeholder = "Correo del administrador";
emailInput.autocomplete = "username";
emailInput.required = true;

const emailLabel = document.createElement("label");
emailLabel.htmlFor = "adminEmail";
emailLabel.textContent = "Correo electrónico";

$("loginForm").insertBefore(emailLabel, $("passwordInput"));
$("loginForm").insertBefore(emailInput, $("passwordInput"));

$("passwordInput").autocomplete = "current-password";

function showLogin() {
  $("adminPanel").hidden = true;
  $("loginPanel").hidden = false;

  $("loginMessage").textContent = "";
  $("loginMessage").classList.remove("error");

  $("passwordInput").value = "";

  $("loginPanel").scrollIntoView({ behavior: "smooth" });
  emailInput.focus();
}

function showPublicPage() {
  $("loginPanel").hidden = true;
  $("adminPanel").hidden = true;
  $("loginBtn").hidden = false;

  resetEventForm();

  window.location.hash = "eventos";
}

function showAdminPanel() {
  $("loginPanel").hidden = true;
  $("adminPanel").hidden = false;
  $("loginBtn").hidden = true;

  renderManageEvents();

  $("adminPanel").scrollIntoView({ behavior: "smooth" });
}

$("loginBtn").addEventListener("click", showLogin);

$("backBtn").addEventListener("click", () => {
  $("loginPanel").hidden = true;
  $("passwordInput").value = "";
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = $("passwordInput").value;

  $("loginMessage").textContent = "Iniciando sesión...";
  $("loginMessage").classList.remove("error");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    $("loginMessage").textContent =
      "No se pudo iniciar sesión. Revisa el correo y la contraseña.";

    $("loginMessage").classList.add("error");
    return;
  }

  if (data.user.id !== ADMIN_UID) {
    await supabaseClient.auth.signOut();

    $("loginMessage").textContent =
      "Esta cuenta no tiene permisos de administrador.";

    $("loginMessage").classList.add("error");
    return;
  }

  isAdmin = true;

  $("loginMessage").textContent = "";
  $("passwordInput").value = "";

  showAdminPanel();
  await loadEvents();
});

$("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();

  isAdmin = false;
  showPublicPage();
});

/* ==========================================
   CREAR Y EDITAR EVENTOS
========================================== */

eventForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin) {
    alert("Debes iniciar sesión para administrar los eventos.");
    return;
  }

  const id = $("eventId").value;

  const newEvent = {
    id: id || crypto.randomUUID(),
    title: $("eventTitle").value.trim(),
    date: $("eventDate").value,
    time: $("eventTime").value,
    place: $("eventPlace").value.trim(),
    description: $("eventDescription").value.trim(),
    image: selectedEventImage,
    details: $("eventDetails").value.trim(),
    detailImages: [...selectedDetailImages]
  };

  if (
    !newEvent.title ||
    !newEvent.date ||
    !newEvent.time ||
    !newEvent.place ||
    !newEvent.description
  ) {
    $("formMessage").textContent =
      "Completa todos los campos obligatorios.";

    $("formMessage").classList.add("error");
    return;
  }

  const saveButton = $("saveBtn");

  saveButton.disabled = true;
  saveButton.textContent = "Guardando...";

  try {
    newEvent.image = await uploadImage(newEvent.image);

    newEvent.detailImages = await Promise.all(
      newEvent.detailImages.map(uploadImage)
    );

    let result;

    if (id) {
      result = await supabaseClient
        .from("eventos")
        .update(eventToRow(newEvent))
        .eq("id", id);
    } else {
      result = await supabaseClient
        .from("eventos")
        .insert(eventToRow(newEvent));
    }

    if (result.error) throw result.error;

    await loadEvents();

    resetEventForm();

    $("formMessage").textContent = id
      ? "Evento actualizado correctamente."
      : "Evento publicado correctamente.";

  } catch (error) {
    console.error("Error guardando evento:", error);

    $("formMessage").textContent =
      "No se pudo guardar el evento: " + error.message;

    $("formMessage").classList.add("error");

  } finally {
    saveButton.disabled = false;
    saveButton.textContent = $("eventId").value
      ? "Guardar cambios"
      : "Publicar evento";
  }
});

/* ==========================================
   LIMPIAR FORMULARIO
========================================== */

function resetEventForm() {
  eventForm.reset();

  showEventImagePreview("");

  selectedDetailImages = [];
  renderDetailImagePreview();

  if (eventImageInput) eventImageInput.value = "";
  if (detailImagesInput) detailImagesInput.value = "";

  $("eventId").value = "";
  $("formTitle").textContent = "Publicar un evento";
  $("saveBtn").textContent = "Publicar evento";
  $("cancelEditBtn").hidden = true;

  $("formMessage").textContent = "";
  $("formMessage").classList.remove("error");
}

$("cancelEditBtn").addEventListener("click", resetEventForm);

/* ==========================================
   EDITAR Y ELIMINAR EVENTOS
========================================== */

manageEvents.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");

  if (!button || !isAdmin) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  const selected = events.find(item => item.id === id);

  if (!selected) return;

  if (action === "edit") {
    $("eventId").value = selected.id;
    $("eventTitle").value = selected.title;
    $("eventDate").value = selected.date;
    $("eventTime").value = selected.time;
    $("eventPlace").value = selected.place;
    $("eventDescription").value = selected.description;
    $("eventDetails").value = selected.details || "";

    showEventImagePreview(selected.image || "");

    selectedDetailImages = [...selected.detailImages];

    renderDetailImagePreview();

    eventImageInput.value = "";
    detailImagesInput.value = "";

    $("formTitle").textContent = "Editar evento";
    $("saveBtn").textContent = "Guardar cambios";
    $("cancelEditBtn").hidden = false;

    $("formMessage").textContent = "";
    $("formMessage").classList.remove("error");

    eventForm.scrollIntoView({ behavior: "smooth" });
    $("eventTitle").focus();
  }

  if (action === "delete") {
    const confirmed = confirm(
      `¿Seguro que quieres eliminar "${selected.title}"?`
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      const { error } = await supabaseClient
        .from("eventos")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await loadEvents();

      if ($("eventId").value === id) {
        resetEventForm();
      }

    } catch (error) {
      console.error("Error eliminando evento:", error);
      alert("No se pudo eliminar el evento: " + error.message);
      button.disabled = false;
    }
  }
});

/* ==========================================
   BUSCADOR, FILTROS Y AÑO
========================================== */

$("searchInput").addEventListener("input", renderEvents);
$("filterSelect").addEventListener("change", renderEvents);

$("currentYear").textContent = new Date().getFullYear();

/* ==========================================
   INICIAR PÁGINA
========================================== */

async function initializePage() {
  events = [];
  renderEvents();

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Error comprobando sesión:", error);
  }

  const user = data?.session?.user;

  if (user && user.id === ADMIN_UID) {
    isAdmin = true;
    showAdminPanel();
  } else {
    isAdmin = false;
    showPublicPage();
  }

  await loadEvents();
}

initializePage();
