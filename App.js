/**
 * ================================
 *  ADMINISTRADOR DE CITAS — app.js
 * ================================
 */

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAm9tR1AfzZ-OuY4Z1k39phsZeTp3FHS8o",
  authDomain: "citas-casa-e6aa0.firebaseapp.com",
  projectId: "citas-casa-e6aa0",
  storageBucket: "citas-casa-e6aa0.firebasestorage.app",
  messagingSenderId: "992685937822",
  appId: "1:992685937822:web:1a4bb7cd7254b54fd2578f"
};

firebase.initializeApp(firebaseConfig);

firebase.firestore.setLogLevel("debug");

const db = firebase.firestore();

// Configuración rápida
const CONFIG = {
  address: "Av. Ejemplo 123, San José, Costa Rica",
  timeSlots: ["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00"],
  daysOff: [],
  workDays: [1,2,3,4,5,6],
  startDate: null,
};

// Estado
let bookings = {}; // objeto vacío
let currentYear, currentMonth;
let selectedDate = null;
let selectedTime = null;

// Firestore helpers
async function loadBookings() {
  const snapshot = await db.collection("bookings").get();
  const data = {};
  snapshot.forEach(doc => { data[doc.id] = doc.data(); });
  return data;
}

async function saveBooking(date, time, booking) {
  const ref = db.collection("bookings").doc(date);
  await ref.set({ [time]: booking }, { merge: true });
}

// Helpers de fecha
function today(){const d=new Date();return toISO(d.getFullYear(),d.getMonth(),d.getDate());}
function toISO(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function parseISO(iso){const [y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d);}
function fmt12(time24){const [h,min]=time24.split(":").map(Number);const suffix=h>=12?"PM":"AM";const h12=h%12||12;return `${h12}:${String(min).padStart(2,"0")} ${suffix}`;}
const MONTHS_ES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
function formatDateLong(iso){const d=parseISO(iso);return `${DAYS_ES[d.getDay()]}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;}

// Lógica de disponibilidad
function isWorkDay(iso){const d=parseISO(iso);return CONFIG.workDays.includes(d.getDay());}
function isDayOff(iso){return CONFIG.daysOff.includes(iso);}
function isPast(iso){return iso<today();}
function minBookableDate(){return CONFIG.startDate??today();}
function slotsForDate(iso){const dayBookings=bookings[iso]||{};return CONFIG.timeSlots.map(t=>({time:t,booked:!!dayBookings[t],bookedBy:dayBookings[t]||null}));}
function dayStatus(iso){if(isPast(iso)||isDayOff(iso)||!isWorkDay(iso))return "unavailable";if(iso<minBookableDate())return "unavailable";const slots=slotsForDate(iso);const bookedCount=slots.filter(s=>s.booked).length;if(bookedCount===0)return "available";if(bookedCount>=slots.length)return "full";return "partial";}

// Render calendario
// ──────────────────────────────────────────────
//  RENDERIZADO DEL CALENDARIO
// ──────────────────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const title = document.getElementById("month-title");

  title.textContent = `${MONTHS_ES[currentMonth]} ${currentYear}`;
  grid.innerHTML = "";

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Celdas vacías al inicio
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "day-cell empty";
    grid.appendChild(empty);
  }

  // Días del mes
  for (let d = 1; d <= daysInMonth; d++) {
    const isoDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const status = dayStatus(isoDate);
    const isToday = isoDate === today();

    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.dataset.date = isoDate;

    if (isToday) cell.classList.add("today");
    if (status === "unavailable") {
      cell.classList.add("past");
    } else {
      cell.classList.add(status); // available | partial | full
    }

    const numEl = document.createElement("span");
    numEl.className = "day-number";
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (status === "available" || status === "partial") {
      const slots = slotsForDate(isoDate);
      const free = slots.filter(s => !s.booked).length;
      const indicator = document.createElement("span");
      indicator.className = "slot-indicator";
      indicator.textContent = `${free} libre${free !== 1 ? "s" : ""}`;
      cell.appendChild(indicator);

      cell.addEventListener("click", () => openModal(isoDate));
      cell.setAttribute("role", "button");
      cell.setAttribute("tabindex", "0");
      cell.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal(isoDate);
        }
      });
    }

    grid.appendChild(cell);
  }
}

// ──────────────────────────────────────────────
//  MODAL
// ──────────────────────────────────────────────
function openModal(iso) {
  selectedDate = iso;
  selectedTime = null;

  document.getElementById("modal-date-title").textContent = formatDateLong(iso);
  renderTimeSlots();
  resetConfirmForm();

  const overlay = document.getElementById("modal-overlay");
  overlay.hidden = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add("visible"));
  });

  document.getElementById("modal-close").focus();
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.remove("visible");
  setTimeout(() => {
    overlay.hidden = true;
    selectedDate = null;
    selectedTime = null;
  }, 220);
}

function renderTimeSlots() {
  const container = document.getElementById("time-slots");
  container.innerHTML = "";

  const slots = slotsForDate(selectedDate);

  slots.forEach(({ time, booked }) => {
    const btn = document.createElement("button");
    btn.className = "time-btn";
    btn.dataset.time = time;

    if (booked) {
      btn.disabled = true;
      btn.innerHTML = `${fmt12(time)}<span class="booked-label">Reservado</span>`;
    } else {
      btn.textContent = fmt12(time);
      btn.addEventListener("click", () => selectTime(time));
    }

    container.appendChild(btn);
  });
}

function selectTime(time) {
  selectedTime = time;
  document.querySelectorAll(".time-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.time === time);
  });

  const form = document.getElementById("confirm-form");
  document.getElementById("selected-time-display").textContent = fmt12(time);
  form.hidden = false;

  setTimeout(() => document.getElementById("visitor-name").focus(), 50);
}

function resetConfirmForm() {
  document.getElementById("confirm-form").hidden = true;
  document.getElementById("visitor-name").value = "";
  document.getElementById("visitor-phone").value = "";
}


async function confirmBooking() {
    console.log("Botón presionado");
  try {
    if(!selectedDate || !selectedTime) return;

    const name = document.getElementById("visitor-name").value.trim();
    const phone = document.getElementById("visitor-phone").value.trim();

    if(!name){
      showToast("Por favor ingresa tu nombre.");
      return;
    }

    await saveBooking(selectedDate, selectedTime, {name, phone});

    bookings = await loadBookings();

    showToast("Cita guardada correctamente");
    closeModal();
    renderCalendar();

  } catch(error) {
    console.error("Error guardando:", error);
    showToast("Error al guardar la cita");
  }
}

async function saveBooking(date, time, booking) {
  try {
    console.log("Intentando guardar:", date, time, booking);

    const ref = db.collection("bookings").doc(date);

    await ref.set(
      {
        [time]: booking
      },
      { merge: true }
    );

    console.log("Guardado completado");

  } catch (error) {
    console.error("ERROR FIRESTORE:", error);
  }
}

// Toast
let toastTimer;
function showToast(msg){const toast=document.getElementById("toast");toast.textContent=msg;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),3500);}

// Navegación
function goToMonth(delta){currentMonth+=delta;if(currentMonth>11){currentMonth=0;currentYear++;}if(currentMonth<0){currentMonth=11;currentYear--;}renderCalendar();}

// INIT único
async function init(){
  const now=new Date();
  currentYear=now.getFullYear();
  currentMonth=now.getMonth();
  document.getElementById("property-address").textContent=CONFIG.address;

  // Cargar datos de Firestore
  bookings=await loadBookings();

  // Ocultar pantalla de carga y mostrar contenido
  document.getElementById("loading-screen").style.display="none";
  document.getElementById("main-content").style.display="block";

  // Eventos
  document.getElementById("prev-month").addEventListener("click",()=>goToMonth(-1));
  document.getElementById("next-month").addEventListener("click",()=>goToMonth(1));
  document.getElementById("modal-close").addEventListener("click",closeModal);
  document.getElementById("modal-overlay").addEventListener("click",e=>{if(e.target===e.currentTarget)closeModal();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
  document.getElementById("btn-confirm").addEventListener("click",confirmBooking);
  document.getElementById("btn-cancel-selection").addEventListener("click",()=>{selectedTime=null;document.querySelectorAll(".time-btn").forEach(b=>b.classList.remove("selected"));document.getElementById("confirm-form").hidden=true;});

  renderCalendar();
}

document.addEventListener("DOMContentLoaded",init);
