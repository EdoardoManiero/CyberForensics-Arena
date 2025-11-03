#  Office 3D Forensic Demo

Un ambiente 3D interattivo immersivo per l'insegnamento della **Digital Forensics** attraverso gamification. Un prototipo didattico innovativo che combina una scrivania virtuale, una console Linux simulata, e una serie di compiti investigativi progressivi.

**Demo Live:** [https://edoardomaniero.github.io/office3D-forensic-demo/](https://edoardomaniero.github.io/office3D-forensic-demo/)

---

##  Indice

- [Panoramica](#panoramica)
- [Caratteristiche Principali](#caratteristiche-principali)
- [Requisiti di Sistema](#requisiti-di-sistema)
- [Come Iniziare](#come-iniziare)
- [Controlli e Interfaccia](#controlli-e-interfaccia)
- [Architettura](#architettura)
- [Tecnologie](#tecnologie)
- [Roadmap Futuri](#roadmap-futuri)
- [Contributi e Feedback](#contributi-e-feedback)

---

##  Panoramica

**Office 3D Forensic Demo** è un prototipo educativo che simula un ufficio di investigazione forense. Gli utenti:
- Si muovono in **prima persona** all'interno di un ambiente 3D realistico
- Interagiscono con **oggetti investigativi** e infrastrutture IT
- Completano **task investigativi progressivi** usando una console Linux simulata
- Apprendono i **fondamenti della digital forensics** in modo coinvolgente

L'applicazione è progettata per:
-  Studenti di cybersecurity e forensics digitali
-  Istituti didattici e corsi universitari
-  Professionisti che desiderano apprendere in modo interattivo

---

##  Caratteristiche Principali

### 1. Ambiente 3D Navigabile
Un ufficio forense completamente 3D con:
-  Scrivania con computer e workstation
-  Libreria con documenti investigativi
-  Armadietti per prove e evidenze
-  Infrastruttura IT (server, router, dispositivi di rete)
-  Illuminazione dinamica e atmosfera realistica

### 2. Console Linux Simulata
Una console interattiva che offre:
-  Supporto per comandi essenziali di Linux: `ls`, `cd`, `cat`, `grep`, `task`, `help`, `clear`
-  Cronologia comandi navigabile (frecce Su/Giù)
-  Autocompletamento con Tab
-  Copia/incolla (seleziona testo, Ctrl+V per incollare)
-  File system simulato con struttura gerarchica realistica

### 3. Sistema di Task Progressivi
Tre **scenari investigativi** indipendenti con task progressivi:

1. **File System Forensic** (6 task)
   - Connettere hard disk esterno
   - Listare dispositivi con `lsblk`
   - Montare la partizione
   - Esplorare il file system
   - Leggere file di log sospetti
   - Usare `grep` per estrarre informazioni critiche

2. **Network Forensic** (5 task)
   - Connettersi a server remoto via SSH
   - Listare log di sistema
   - Leggere authentication log
   - Cercare tentativi di accesso falliti
   - Analizzare capture di traffico con tcpdump

3. **Memory Forensic** (6 task)
   - Connettere hard disk con memory dump
   - Verificare dispositivi collegati
   - Montare la partizione con dump
   - Listare file di memoria
   - Analizzare processi sospetti
   - Usare Volatility per analisi avanzata

### 4. Elementi di Gamification (Base)
-  **Progressione Lineare**: Task sequenziali con feedback immediato
-  **Toast Notifications**: Notifiche visive per azioni completate e feedback
-  **Narrazione Coerente**: Una storia investigativa realistica
-  **Esplorazione Incentivata**: Ambiente 3D che invita alla scoperta
-  **Istruzioni Chiare**: Obiettivi visibili nell'HUD in tempo reale
-  **Tutorial Interattivo**: Guida iniziale per i nuovi utenti

### 5. Sistema di Gestione Task
-  HUD collassabile che mostra il task corrente
-  Barra di progresso per il completamento
-  Notifiche toast per feedback in tempo reale
-  Gestione scenari tramite file JSON

---

##  Requisiti di Sistema

### Browser
- Chrome/Chromium 
- Firefox 
- Safari 
- Edge 

### Hardware
- **GPU**: Scheda grafica con supporto WebGL 2.0
- **RAM**: Minimo 4GB (consigliati 8GB)
- **Processore**: Dual-core moderno

### Connessione
- Banda minima: 5 Mbps (per caricamento risorse 3D)

### Input
-  Tastiera QWERTY
-  Mouse o trackpad

---

##  Come Iniziare

### Opzione 1: Demo Live (Consigliato)
Visita semplicemente: [https://edoardomaniero.github.io/office3D-forensic-demo/](https://edoardomaniero.github.io/office3D-forensic-demo/)

### Opzione 2: Installazione Locale

#### Prerequisiti
- Node.js 16+ e npm
- Git

#### Installazione
```bash
# Clone il repository
git clone https://github.com/EdoardoManiero/office3D-forensic-demo.git
cd office3D-forensic-demo

# Installa dipendenze
npm install

# Avvia il server di sviluppo
npm run dev

# Accedi a http://localhost:5173
```

#### Build per Produzione
```bash
npm run build
```

---

##  Controlli e Interfaccia

### Navigazione
| Tasto | Funzione |
|-------|----------|
| **W** | Avanti |
| **A** | Sinistra |
| **S** | Indietro |
| **D** | Destra |
| **Mouse** | Guarda attorno |

### Interazione
| Tasto | Funzione |
|-------|----------|
| **E** | Interagisci con oggetto (quando vicino) |
| **C** | Apri/Chiudi console |
| **ESC** | Chiudi console |
| **Tab** | Autocompletamento console |

### Console
| Tasto | Funzione |
|-------|----------|
| **/** | Naviga cronologia comandi |
| **Ctrl+V** | Incolla testo |
| **Ctrl+C** | Cancella input |

---

##  Architettura

### Struttura del Progetto
```
office3D-forensic-demo/
 index.html                    # Punto di ingresso HTML
 style.css                     # Stili globali

 js/                           # Logica applicazione
    main.js                   # Entry point e coordinamento
    scene.js                  # Setup ambiente 3D e camera
    interaction.js            # Gestione interazioni utente
    console.js                # Console Linux simulata
   
    eventBus.js               # Sistema di event communication
    taskManager.js            # Gestione dei task investigativi
    taskHud.js                # UI del task HUD
    TutorialManager.js        # Tutorial e guida iniziale
    ScenarioIntroManager.js   # Introduzione scenari

 models/                       # Asset 3D (formato .glb)
    secret_lab.glb             # Laboratorio forense

 scenarios.json                # Definizione compiti/scenari
 package.json                  # Dipendenze e build config
 README.md                     # Questo file
```

### Flusso dell'Applicazione
```
main.js (bootstrap)
    
scene.js (3D setup)
    
interaction.js (event listeners)
    
taskManager.js (task flow)
     console.js (command execution)
     taskHud.js (UI update)
     eventBus.js (communication)
```

### Sistema di Event Bus
L'applicazione utilizza un **pattern Pub/Sub centralizzato** per la comunicazione tra moduli, eliminando dipendenze circolari:

**Come Funziona:**
- **Publish**: Un modulo emette un evento (es: `TASK_COMPLETED`)
- **Subscribe**: Altri moduli si registrano per ascoltare l'evento
- **Callback**: Il listener riceve i dati e reagisce di conseguenza

**Esempi di Eventi Chiave:**
```
Rendering Layer  Logic Layer:
  - MESH_CLICKED: Utente clicca su un oggetto 3D
  - CONSOLE_COMMAND_EXECUTED: Comando eseguito nella console

Logic Layer  UI Layer:
  - TASK_COMPLETED: Task completato
  - PROGRESS_UPDATED: Progresso aggiornato

Logic Layer  Rendering Layer:
  - SCENARIO_HIGHLIGHTS_UPDATED: Evidenzia nuovi oggetti interattivi
```

**Vantaggi:**
-  Moduli totalmente disaccoppiati
-  Nessun import circolare tra file
-  Facile aggiungere nuovi listener senza modificare il codice esistente
-  Storico degli eventi per debugging

---

##  Tecnologie

### Frontend
- **HTML5** - Struttura semantica
- **CSS3** - Layout Flexbox, Grid, animazioni
- **JavaScript (ES6+)** - Logica applicazione

### Rendering 3D
- **Babylon.js 8.33** - Engine 3D WebGL
  - Modelli 3D in formato glTF/GLB
  - Illuminazione dinamica
  - Gestione camera e fisica

### Console Simulata
- **xterm.js 5.3** - Emulatore terminale
  - Addon fit per adattamento finestra
  - Supporto per ANSI escape sequences

### Build e Deploy
- **Vite 7.1** - Build tool ultrarapido
- **npm** - Package manager
- **GitHub Pages** - Hosting

### Versioning
- **Git** - Version control
- **Node.js 16+** - Runtime

---

##  Contributi e Feedback

Apprezziamo molto il feedback della comunità!

### Segnalare Bug
Apri un [Issue su GitHub](https://github.com/EdoardoManiero/office3D-forensic-demo/issues) con:
- Descrizione del problema
- Passi per riprodurlo
- Browser e versione utilizzati
- Screenshot/log se disponibili

### Suggerimenti e Feature Requests
Condividi le tue idee aperendo una [Discussion](https://github.com/EdoardoManiero/office3D-forensic-demo/discussions)

### Come Contribuire
1. Fork il repository
2. Crea un branch (`git checkout -b feature/NuovaFeature`)
3. Commit le modifiche (`git commit -m 'Add: nuova feature'`)
4. Push al branch (`git push origin feature/NuovaFeature`)
5. Apri una Pull Request

---

##  Contatti e Supporto

**Autore:** Edoardo Maniero  
**Email:** [edoardomaniero@gmail.com](mailto:edoardomaniero@gmail.com)  
**GitHub:** [@EdoardoManiero](https://github.com/EdoardoManiero)  
**Repository:** [office3D-forensic-demo](https://github.com/EdoardoManiero/office3D-forensic-demo)

---

##  Licenza

Questo progetto è distribuito sotto licenza **ISC**.

```
ISC License - Vedi LICENSE file per dettagli completi
```

---

##  Risorse Educative Consigliate

### Digital Forensics
- NIST Guidelines on Mobile Device Forensics
- SANS Cyber Aces Forensic Challenges
- Digital Forensics Research Lab (DFRL)

### Cybersecurity
- TryHackMe Modules
- HackTheBox Challenges
- OverTheWire Wargames

### 3D Web Development
- Babylon.js Documentation
- WebGL Best Practices
- ThreeJS vs Babylon.js comparison

---

**Made with Love for Digital Forensics Education**

*Ultimo aggiornamento: 2025*