import { m } from "./paraglide/messages.js";

const SOURCE_URLS = [
  {
    label: "symptoms_source_who",
    url: "https://www.who.int/fr/news-room/fact-sheets/detail/ebola-disease",
  },
  {
    label: "symptoms_source_cdc",
    url: "https://www.cdc.gov/ebola/signs-symptoms/index.html",
  },
  {
    label: "symptoms_source_who_africa",
    url: "https://www.afro.who.int/health-topics/ebola-disease",
  },
];

function renderList(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

/**
 * Render source-reviewed Ebola health guidance in the requested locale.
 * @param {"en"|"fr"} [locale="en"]
 * @returns {string}
 */
export function renderEbolaHealthGuidance(locale = "en") {
  const messageOptions = { locale };
  const earlySymptoms = [
    m.symptoms_early_fever({}, messageOptions),
    m.symptoms_early_headache({}, messageOptions),
    m.symptoms_early_aches({}, messageOptions),
    m.symptoms_early_weakness({}, messageOptions),
    m.symptoms_early_sore_throat({}, messageOptions),
    m.symptoms_early_appetite({}, messageOptions),
  ];
  const laterSymptoms = [
    m.symptoms_later_nausea({}, messageOptions),
    m.symptoms_later_diarrhoea({}, messageOptions),
    m.symptoms_later_abdominal_pain({}, messageOptions),
    m.symptoms_later_rash_or_red_eyes({}, messageOptions),
    m.symptoms_later_confusion_or_breathing({}, messageOptions),
    m.symptoms_later_bleeding({}, messageOptions),
  ];
  const lookAlikes = [
    ["symptoms_lookalike_malaria", "symptoms_lookalike_malaria_overlap"],
    ["symptoms_lookalike_typhoid", "symptoms_lookalike_typhoid_overlap"],
    ["symptoms_lookalike_meningitis", "symptoms_lookalike_meningitis_overlap"],
    ["symptoms_lookalike_shigellosis", "symptoms_lookalike_shigellosis_overlap"],
    ["symptoms_lookalike_marburg", "symptoms_lookalike_marburg_overlap"],
  ]
    .map(
      ([name, overlap]) => `
        <article class="look-alike-item">
          <h3>${m[name]({}, messageOptions)}</h3>
          <p>${m[overlap]({}, messageOptions)}</p>
        </article>`,
    )
    .join("");
  const sources = SOURCE_URLS.map(
    ({ label, url }) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${m[label]({}, messageOptions)}</a>`,
  ).join(" · ");

  return `
    <dialog id="symptoms-dialog" class="analytics-dialog symptoms-dialog" aria-labelledby="symptoms-dialog-title">
      <div class="dialog-content">
        <header class="dialog-header">
          <div>
            <span class="dialog-badge">${m.symptoms_dialog_badge({}, messageOptions)}</span>
            <h2 id="symptoms-dialog-title">${m.symptoms_dialog_title({}, messageOptions)}</h2>
          </div>
          <button type="button" class="dialog-close-btn" id="close-symptoms-modal" aria-label="${m.symptoms_close_aria({}, messageOptions)}">✕</button>
        </header>

        <p class="symptoms-intro">${m.symptoms_intro({}, messageOptions)}</p>

        <div class="symptom-phase-grid">
          <section class="symptom-phase">
            <span class="symptom-phase-label">${m.symptoms_early_label({}, messageOptions)}</span>
            <h3>${m.symptoms_early_title({}, messageOptions)}</h3>
            <ul>${renderList(earlySymptoms)}</ul>
          </section>
          <section class="symptom-phase later">
            <span class="symptom-phase-label">${m.symptoms_later_label({}, messageOptions)}</span>
            <h3>${m.symptoms_later_title({}, messageOptions)}</h3>
            <ul>${renderList(laterSymptoms)}</ul>
          </section>
        </div>

        <section class="look-alike-section" aria-labelledby="look-alike-title">
          <div class="look-alike-heading">
            <div>
              <span class="symptom-phase-label">${m.symptoms_lookalike_label({}, messageOptions)}</span>
              <h3 id="look-alike-title">${m.symptoms_lookalike_title({}, messageOptions)}</h3>
            </div>
            <span class="chart-tag">${m.symptoms_lookalike_tag({}, messageOptions)}</span>
          </div>
          <div class="look-alike-grid">${lookAlikes}</div>
        </section>

        <aside class="medical-safety-note" role="note">
          <strong>${m.symptoms_safety_title({}, messageOptions)}</strong>
          ${m.symptoms_safety_body({}, messageOptions)}
        </aside>

        <div class="dialog-footer symptoms-footer">
          <span class="dialog-note">${m.symptoms_sources_label({}, messageOptions)} ${sources}</span>
          <button type="button" class="dialog-action-btn" id="symptoms-done-btn">${m.symptoms_dismiss({}, messageOptions)}</button>
        </div>
      </div>
    </dialog>`;
}
