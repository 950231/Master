// Question bank aligned to the AP Vidyut AEE (Assistant Executive Engineer) syllabus.
// Structure: Common section (all candidates) + Core section (engineering branch).
// This starter set focuses on the Common subjects + Electrical core; users can
// import their own JSON to grow the bank toward full exam depth.
//
// Each question: { id, subject, q, options: [4], answer: <index 0-3>, explanation }

export const SUBJECTS = [
  // ----- Common (all candidates) -----
  { id: 'reason', name: 'Reasoning & Gen. Intelligence', icon: '🧩', group: 'common' },
  { id: 'ga', name: 'General Awareness', icon: '🌍', group: 'common' },
  { id: 'quant', name: 'Quantitative Aptitude', icon: '🔢', group: 'common' },
  { id: 'english', name: 'English & Comprehension', icon: '📘', group: 'common' },
  { id: 'computer', name: 'Computer Knowledge', icon: '💻', group: 'common' },
  // ----- Core (engineering branch: Electrical) -----
  { id: 'elec', name: 'Electrical (Core)', icon: '⚡', group: 'core' },
]

export const GROUPS = {
  common: 'Common — all candidates',
  core: 'Core — Electrical (70 marks)',
}

export const QUESTIONS = [
  // ---------- Reasoning & General Intelligence ----------
  {
    id: 're1', subject: 'reason',
    q: 'Find the next number: 2, 4, 8, 16, ?',
    options: ['20', '24', '32', '30'], answer: 2,
    explanation: 'Each term is doubled: 16 × 2 = 32.',
  },
  {
    id: 're2', subject: 'reason',
    q: 'Find the next number: 1, 4, 9, 16, ?',
    options: ['20', '25', '24', '36'], answer: 1,
    explanation: 'Perfect squares: 1², 2², 3², 4², 5² = 25.',
  },
  {
    id: 're3', subject: 'reason',
    q: 'Hand : Glove :: Foot : ?',
    options: ['Shoe', 'Sock', 'Toe', 'Leg'], answer: 1,
    explanation: 'A glove covers a hand as a sock covers a foot.',
  },
  {
    id: 're4', subject: 'reason',
    q: 'Which one is the odd one out?',
    options: ['Rose', 'Lotus', 'Mango', 'Jasmine'], answer: 2,
    explanation: 'Mango is a fruit; the others are flowers.',
  },
  {
    id: 're5', subject: 'reason',
    q: 'Find the odd one out: 3, 5, 7, 9, 11',
    options: ['3', '5', '9', '11'], answer: 2,
    explanation: '9 is the only non-prime number in the list.',
  },
  {
    id: 're6', subject: 'reason',
    q: 'In a certain code, if A = 1 and B = 2, then the value of the letter D is:',
    options: ['3', '4', '5', '6'], answer: 1,
    explanation: 'A=1, B=2, C=3, D=4.',
  },
  {
    id: 're7', subject: 'reason',
    q: 'Find the next number: 3, 6, 12, 24, ?',
    options: ['36', '48', '30', '42'], answer: 1,
    explanation: 'Each term doubles: 24 × 2 = 48.',
  },

  // ---------- General Awareness ----------
  {
    id: 'ga1', subject: 'ga',
    q: 'What is the currency of India?',
    options: ['Rupee', 'Dollar', 'Taka', 'Dinar'], answer: 0,
    explanation: 'The official currency of India is the Indian Rupee (₹).',
  },
  {
    id: 'ga2', subject: 'ga',
    q: 'The national animal of India is the:',
    options: ['Lion', 'Elephant', 'Tiger', 'Peacock'], answer: 2,
    explanation: 'The Royal Bengal Tiger is the national animal of India.',
  },
  {
    id: 'ga3', subject: 'ga',
    q: 'Andhra Pradesh is located in which part of India?',
    options: ['Northern', 'Southern', 'Eastern', 'Western'], answer: 1,
    explanation: 'Andhra Pradesh is a state in southern India, on the south-east coast.',
  },
  {
    id: 'ga4', subject: 'ga',
    q: 'What is the capital of India?',
    options: ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], answer: 2,
    explanation: 'New Delhi is the capital of India.',
  },
  {
    id: 'ga5', subject: 'ga',
    q: 'How many states are there in India (as of 2024)?',
    options: ['27', '28', '29', '30'], answer: 1,
    explanation: 'India has 28 states and 8 Union Territories.',
  },
  {
    id: 'ga6', subject: 'ga',
    q: 'The largest planet in our solar system is:',
    options: ['Saturn', 'Earth', 'Jupiter', 'Mars'], answer: 2,
    explanation: 'Jupiter is the largest planet in the solar system.',
  },
  {
    id: 'ga7', subject: 'ga',
    q: 'Which gas do plants absorb during photosynthesis?',
    options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2,
    explanation: 'Plants absorb carbon dioxide and release oxygen during photosynthesis.',
  },

  // ---------- Quantitative Aptitude ----------
  {
    id: 'qa1', subject: 'quant',
    q: 'What is 15% of 200?',
    options: ['20', '30', '15', '25'], answer: 1,
    explanation: '15% of 200 = (15/100) × 200 = 30.',
  },
  {
    id: 'qa2', subject: 'quant',
    q: 'A train covers 60 km in 1.5 hours. Its speed is:',
    options: ['30 km/h', '40 km/h', '45 km/h', '90 km/h'], answer: 1,
    explanation: 'Speed = distance / time = 60 / 1.5 = 40 km/h.',
  },
  {
    id: 'qa3', subject: 'quant',
    q: 'The average of 10, 20 and 30 is:',
    options: ['15', '20', '25', '30'], answer: 1,
    explanation: '(10 + 20 + 30) / 3 = 20.',
  },
  {
    id: 'qa4', subject: 'quant',
    q: 'The LCM of 4 and 6 is:',
    options: ['8', '12', '24', '10'], answer: 1,
    explanation: 'The lowest common multiple of 4 and 6 is 12.',
  },
  {
    id: 'qa5', subject: 'quant',
    q: 'The square root of 169 is:',
    options: ['11', '12', '13', '14'], answer: 2,
    explanation: '13 × 13 = 169.',
  },
  {
    id: 'qa6', subject: 'quant',
    q: 'Express 3/4 as a percentage.',
    options: ['65%', '70%', '75%', '80%'], answer: 2,
    explanation: '3/4 = 0.75 = 75%.',
  },
  {
    id: 'qa7', subject: 'quant',
    q: 'The decimal 0.25 is equal to which fraction?',
    options: ['1/2', '1/4', '1/5', '2/5'], answer: 1,
    explanation: '0.25 = 25/100 = 1/4.',
  },

  // ---------- English & Comprehension ----------
  {
    id: 'en1', subject: 'english',
    q: 'Choose the antonym of "Ancient":',
    options: ['Old', 'Modern', 'Historic', 'Aged'], answer: 1,
    explanation: '"Modern" is the opposite of "Ancient".',
  },
  {
    id: 'en2', subject: 'english',
    q: 'Choose the synonym of "Happy":',
    options: ['Sad', 'Joyful', 'Angry', 'Tired'], answer: 1,
    explanation: '"Joyful" means the same as "Happy".',
  },
  {
    id: 'en3', subject: 'english',
    q: 'What is the plural of "Child"?',
    options: ['Childs', 'Childes', 'Children', 'Childrens'], answer: 2,
    explanation: '"Children" is the correct irregular plural of "Child".',
  },
  {
    id: 'en4', subject: 'english',
    q: 'Choose the correctly spelled word:',
    options: ['Definately', 'Definitely', 'Definitly', 'Defenitely'], answer: 1,
    explanation: 'The correct spelling is "Definitely".',
  },
  {
    id: 'en5', subject: 'english',
    q: 'The idiom "to break the ice" means:',
    options: ['To start a conversation', 'To feel very cold', 'To break something', 'To waste time'], answer: 0,
    explanation: '"To break the ice" means to initiate conversation in a social setting.',
  },
  {
    id: 'en6', subject: 'english',
    q: 'One word for "a person who cannot read or write":',
    options: ['Literate', 'Illiterate', 'Educated', 'Scholar'], answer: 1,
    explanation: 'An "illiterate" person cannot read or write.',
  },

  // ---------- Computer Knowledge ----------
  {
    id: 'co1', subject: 'computer',
    q: 'CPU stands for:',
    options: ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Central Peripheral Unit'], answer: 1,
    explanation: 'CPU stands for Central Processing Unit — the "brain" of a computer.',
  },
  {
    id: 'co2', subject: 'computer',
    q: 'The keyboard shortcut to copy is:',
    options: ['Ctrl + V', 'Ctrl + X', 'Ctrl + C', 'Ctrl + Z'], answer: 2,
    explanation: 'Ctrl + C copies; Ctrl + V pastes.',
  },
  {
    id: 'co3', subject: 'computer',
    q: 'RAM stands for:',
    options: ['Read Access Memory', 'Random Access Memory', 'Rapid Access Memory', 'Run Access Memory'], answer: 1,
    explanation: 'RAM = Random Access Memory, a volatile working memory.',
  },
  {
    id: 'co4', subject: 'computer',
    q: 'Which of the following is an input device?',
    options: ['Monitor', 'Printer', 'Keyboard', 'Speaker'], answer: 2,
    explanation: 'A keyboard is an input device; the others are output devices.',
  },
  {
    id: 'co5', subject: 'computer',
    q: 'A "Trojan" in computing is a type of:',
    options: ['Hardware', 'Malware', 'Web browser', 'Spreadsheet'], answer: 1,
    explanation: 'A Trojan is malicious software (malware) disguised as legitimate.',
  },
  {
    id: 'co6', subject: 'computer',
    q: 'A firewall is mainly used for:',
    options: ['Cooling the CPU', 'Network security', 'Increasing RAM', 'Printing'], answer: 1,
    explanation: 'A firewall monitors and controls network traffic for security.',
  },
  {
    id: 'co7', subject: 'computer',
    q: 'Which is an example of an operating system?',
    options: ['MS Word', 'Windows', 'Google', 'Excel'], answer: 1,
    explanation: 'Windows is an operating system; the others are applications/services.',
  },

  // ---------- Electrical (Core) ----------
  {
    id: 'el1', subject: 'elec',
    q: 'The SI unit of electrical resistance is the:',
    options: ['Ampere', 'Volt', 'Ohm', 'Watt'], answer: 2,
    explanation: 'Resistance is measured in ohms (Ω).',
  },
  {
    id: 'el2', subject: 'elec',
    q: "According to Ohm's law, V = ?",
    options: ['I / R', 'I × R', 'R / I', 'I + R'], answer: 1,
    explanation: "Ohm's law: Voltage = Current × Resistance (V = I × R).",
  },
  {
    id: 'el3', subject: 'elec',
    q: 'The frequency of AC supply in India is:',
    options: ['40 Hz', '50 Hz', '60 Hz', '100 Hz'], answer: 1,
    explanation: 'The standard power supply frequency in India is 50 Hz.',
  },
  {
    id: 'el4', subject: 'elec',
    q: 'A transformer works on the principle of:',
    options: ['Self induction', 'Mutual induction', 'Ohm’s law', 'Coulomb’s law'], answer: 1,
    explanation: 'A transformer transfers energy between windings via mutual induction.',
  },
  {
    id: 'el5', subject: 'elec',
    q: 'A transformer changes voltage and current but does NOT change the:',
    options: ['Power', 'Frequency', 'Turns ratio', 'Flux'], answer: 1,
    explanation: 'A transformer keeps the supply frequency unchanged.',
  },
  {
    id: 'el6', subject: 'elec',
    q: 'The power factor of a purely resistive AC circuit is:',
    options: ['Zero', '0.5', 'Unity (1)', 'Infinite'], answer: 2,
    explanation: 'In a purely resistive circuit, voltage and current are in phase, so pf = 1.',
  },
  {
    id: 'el7', subject: 'elec',
    q: "Kirchhoff's Current Law (KCL) is based on the conservation of:",
    options: ['Energy', 'Charge', 'Momentum', 'Mass'], answer: 1,
    explanation: 'KCL is based on conservation of electric charge at a node.',
  },
  {
    id: 'el8', subject: 'elec',
    q: "Kirchhoff's Voltage Law (KVL) is based on the conservation of:",
    options: ['Charge', 'Energy', 'Power', 'Flux'], answer: 1,
    explanation: 'KVL follows from conservation of energy around a closed loop.',
  },
  {
    id: 'el9', subject: 'elec',
    q: 'The direction of an induced current is given by:',
    options: ["Ohm's law", "Lenz's law", "Faraday's law", "Ampere's law"], answer: 1,
    explanation: "Lenz's law gives the direction of induced current (opposing the change).",
  },
  {
    id: 'el10', subject: 'elec',
    q: 'The SI unit of capacitance is the:',
    options: ['Henry', 'Farad', 'Weber', 'Tesla'], answer: 1,
    explanation: 'Capacitance is measured in farads (F).',
  },
  {
    id: 'el11', subject: 'elec',
    q: 'For a balanced 3-phase system, total power P equals:',
    options: ['VL × IL', '√3 × VL × IL × cosφ', '3 × VL × IL', 'VL × IL × cosφ'], answer: 1,
    explanation: 'Three-phase power P = √3 · V_L · I_L · cosφ.',
  },
  {
    id: 'el12', subject: 'elec',
    q: 'A fuse is always connected in the circuit in:',
    options: ['Parallel', 'Series', 'Star', 'Delta'], answer: 1,
    explanation: 'A fuse is connected in series so it breaks the circuit on overcurrent.',
  },
  {
    id: 'el13', subject: 'elec',
    q: 'In a DC motor, the back EMF is proportional to the:',
    options: ['Armature resistance', 'Speed of the motor', 'Supply frequency', 'Number of brushes'], answer: 1,
    explanation: 'Back EMF Eb ∝ φN, so for constant flux it is proportional to speed.',
  },
  {
    id: 'el14', subject: 'elec',
    q: 'Which instrument is used to measure electric current?',
    options: ['Voltmeter', 'Ammeter', 'Wattmeter', 'Ohmmeter'], answer: 1,
    explanation: 'An ammeter measures current and is connected in series.',
  },
  {
    id: 'el15', subject: 'elec',
    q: '1 kilowatt is equal to how many watts?',
    options: ['100', '1000', '10', '10000'], answer: 1,
    explanation: '1 kilowatt (kW) = 1000 watts.',
  },
]
