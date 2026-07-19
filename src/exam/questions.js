// Question bank aligned to the AP Vidyut AEE (Assistant Executive Engineer) —
// Electrical branch. Core section is split into the syllabus's electrical
// topics; the Common section applies to all candidates.
//
// These are practice questions mapped to the syllabus (standard, repeatedly
// tested concepts) — NOT scraped actual past papers. To add real previous-year
// questions, import them as JSON (see the Import option in the app).
//
// Each question: { id, subject, q, options: [4], answer: <index 0-3>, explanation }

export const SUBJECTS = [
  // ----- Common (all candidates) -----
  { id: 'reason', name: 'Reasoning & Gen. Intelligence', icon: '🧩', group: 'common' },
  { id: 'ga', name: 'General Awareness', icon: '🌍', group: 'common' },
  { id: 'quant', name: 'Quantitative Aptitude', icon: '🔢', group: 'common' },
  { id: 'english', name: 'English & Comprehension', icon: '📘', group: 'common' },
  { id: 'computer', name: 'Computer Knowledge', icon: '💻', group: 'common' },
  // ----- Core: Electrical (70 marks) -----
  { id: 'ec', name: 'Electric Circuits', icon: '⚡', group: 'core' },
  { id: 'em', name: 'Electrical Machines', icon: '⚙️', group: 'core' },
  { id: 'ps', name: 'Power Systems', icon: '🔌', group: 'core' },
  { id: 'meas', name: 'Measurements', icon: '📏', group: 'core' },
  { id: 'cs', name: 'Control Systems', icon: '🎛️', group: 'core' },
  { id: 'pe', name: 'Power Electronics & Drives', icon: '🔋', group: 'core' },
  { id: 'ade', name: 'Analog & Digital Electronics', icon: '🔲', group: 'core' },
]

export const GROUPS = {
  common: 'Common — all candidates',
  core: 'Core — Electrical (70 marks)',
}

export const QUESTIONS = [
  // ==================== COMMON ====================

  // ---------- Reasoning ----------
  { id: 're1', subject: 'reason', q: 'Find the next number: 2, 4, 8, 16, ?', options: ['20', '24', '32', '30'], answer: 2, explanation: 'Each term is doubled: 16 × 2 = 32.' },
  { id: 're2', subject: 'reason', q: 'Find the next number: 1, 4, 9, 16, ?', options: ['20', '25', '24', '36'], answer: 1, explanation: 'Perfect squares: 5² = 25.' },
  { id: 're3', subject: 'reason', q: 'Hand : Glove :: Foot : ?', options: ['Shoe', 'Sock', 'Toe', 'Leg'], answer: 1, explanation: 'A glove covers a hand as a sock covers a foot.' },
  { id: 're4', subject: 'reason', q: 'Which one is the odd one out?', options: ['Rose', 'Lotus', 'Mango', 'Jasmine'], answer: 2, explanation: 'Mango is a fruit; the others are flowers.' },
  { id: 're5', subject: 'reason', q: 'Find the odd one out: 3, 5, 7, 9, 11', options: ['3', '5', '9', '11'], answer: 2, explanation: '9 is the only non-prime number.' },
  { id: 're6', subject: 'reason', q: 'If A = 1 and B = 2, the value of the letter D is:', options: ['3', '4', '5', '6'], answer: 1, explanation: 'A=1, B=2, C=3, D=4.' },
  { id: 're7', subject: 'reason', q: 'Find the next number: 3, 6, 12, 24, ?', options: ['36', '48', '30', '42'], answer: 1, explanation: 'Each term doubles: 24 × 2 = 48.' },

  // ---------- General Awareness ----------
  { id: 'ga1', subject: 'ga', q: 'What is the currency of India?', options: ['Rupee', 'Dollar', 'Taka', 'Dinar'], answer: 0, explanation: 'The Indian Rupee (₹).' },
  { id: 'ga2', subject: 'ga', q: 'The national animal of India is the:', options: ['Lion', 'Elephant', 'Tiger', 'Peacock'], answer: 2, explanation: 'The Royal Bengal Tiger.' },
  { id: 'ga3', subject: 'ga', q: 'Andhra Pradesh is located in which part of India?', options: ['Northern', 'Southern', 'Eastern', 'Western'], answer: 1, explanation: 'AP is a state in southern India, on the south-east coast.' },
  { id: 'ga4', subject: 'ga', q: 'What is the capital of India?', options: ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], answer: 2, explanation: 'New Delhi.' },
  { id: 'ga5', subject: 'ga', q: 'How many states are there in India (as of 2024)?', options: ['27', '28', '29', '30'], answer: 1, explanation: '28 states and 8 Union Territories.' },
  { id: 'ga6', subject: 'ga', q: 'The largest planet in our solar system is:', options: ['Saturn', 'Earth', 'Jupiter', 'Mars'], answer: 2, explanation: 'Jupiter.' },
  { id: 'ga7', subject: 'ga', q: 'Which gas do plants absorb during photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2, explanation: 'Plants absorb CO₂ and release oxygen.' },

  // ---------- Quantitative Aptitude ----------
  { id: 'qa1', subject: 'quant', q: 'What is 15% of 200?', options: ['20', '30', '15', '25'], answer: 1, explanation: '(15/100) × 200 = 30.' },
  { id: 'qa2', subject: 'quant', q: 'A train covers 60 km in 1.5 hours. Its speed is:', options: ['30 km/h', '40 km/h', '45 km/h', '90 km/h'], answer: 1, explanation: '60 / 1.5 = 40 km/h.' },
  { id: 'qa3', subject: 'quant', q: 'The average of 10, 20 and 30 is:', options: ['15', '20', '25', '30'], answer: 1, explanation: '60 / 3 = 20.' },
  { id: 'qa4', subject: 'quant', q: 'The LCM of 4 and 6 is:', options: ['8', '12', '24', '10'], answer: 1, explanation: 'LCM(4, 6) = 12.' },
  { id: 'qa5', subject: 'quant', q: 'The square root of 169 is:', options: ['11', '12', '13', '14'], answer: 2, explanation: '13 × 13 = 169.' },
  { id: 'qa6', subject: 'quant', q: 'Express 3/4 as a percentage.', options: ['65%', '70%', '75%', '80%'], answer: 2, explanation: '3/4 = 0.75 = 75%.' },
  { id: 'qa7', subject: 'quant', q: 'The decimal 0.25 equals which fraction?', options: ['1/2', '1/4', '1/5', '2/5'], answer: 1, explanation: '0.25 = 1/4.' },

  // ---------- English ----------
  { id: 'en1', subject: 'english', q: 'Choose the antonym of "Ancient":', options: ['Old', 'Modern', 'Historic', 'Aged'], answer: 1, explanation: '"Modern" is the opposite of "Ancient".' },
  { id: 'en2', subject: 'english', q: 'Choose the synonym of "Happy":', options: ['Sad', 'Joyful', 'Angry', 'Tired'], answer: 1, explanation: '"Joyful" means "Happy".' },
  { id: 'en3', subject: 'english', q: 'What is the plural of "Child"?', options: ['Childs', 'Childes', 'Children', 'Childrens'], answer: 2, explanation: '"Children".' },
  { id: 'en4', subject: 'english', q: 'Choose the correctly spelled word:', options: ['Definately', 'Definitely', 'Definitly', 'Defenitely'], answer: 1, explanation: 'The correct spelling is "Definitely".' },
  { id: 'en5', subject: 'english', q: 'The idiom "to break the ice" means:', options: ['To start a conversation', 'To feel cold', 'To break something', 'To waste time'], answer: 0, explanation: 'It means to initiate conversation.' },
  { id: 'en6', subject: 'english', q: 'One word for "a person who cannot read or write":', options: ['Literate', 'Illiterate', 'Educated', 'Scholar'], answer: 1, explanation: 'An "illiterate" person.' },

  // ---------- Computer Knowledge ----------
  { id: 'co1', subject: 'computer', q: 'CPU stands for:', options: ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Central Peripheral Unit'], answer: 1, explanation: 'Central Processing Unit.' },
  { id: 'co2', subject: 'computer', q: 'The keyboard shortcut to copy is:', options: ['Ctrl + V', 'Ctrl + X', 'Ctrl + C', 'Ctrl + Z'], answer: 2, explanation: 'Ctrl + C copies.' },
  { id: 'co3', subject: 'computer', q: 'RAM stands for:', options: ['Read Access Memory', 'Random Access Memory', 'Rapid Access Memory', 'Run Access Memory'], answer: 1, explanation: 'Random Access Memory (volatile).' },
  { id: 'co4', subject: 'computer', q: 'Which of the following is an input device?', options: ['Monitor', 'Printer', 'Keyboard', 'Speaker'], answer: 2, explanation: 'A keyboard is an input device.' },
  { id: 'co5', subject: 'computer', q: 'A "Trojan" is a type of:', options: ['Hardware', 'Malware', 'Web browser', 'Spreadsheet'], answer: 1, explanation: 'A Trojan is malware.' },
  { id: 'co6', subject: 'computer', q: 'A firewall is mainly used for:', options: ['Cooling the CPU', 'Network security', 'Increasing RAM', 'Printing'], answer: 1, explanation: 'It controls network traffic for security.' },
  { id: 'co7', subject: 'computer', q: 'Which is an example of an operating system?', options: ['MS Word', 'Windows', 'Google', 'Excel'], answer: 1, explanation: 'Windows is an OS.' },

  // ==================== CORE: ELECTRICAL ====================

  // ---------- Electric Circuits ----------
  { id: 'ec1', subject: 'ec', q: 'The SI unit of electrical resistance is the:', options: ['Ampere', 'Volt', 'Ohm', 'Watt'], answer: 2, explanation: 'Resistance is measured in ohms (Ω).' },
  { id: 'ec2', subject: 'ec', q: "According to Ohm's law, V = ?", options: ['I / R', 'I × R', 'R / I', 'I + R'], answer: 1, explanation: 'V = I × R.' },
  { id: 'ec3', subject: 'ec', q: "Kirchhoff's Current Law (KCL) is based on conservation of:", options: ['Energy', 'Charge', 'Momentum', 'Mass'], answer: 1, explanation: 'KCL — conservation of charge at a node.' },
  { id: 'ec4', subject: 'ec', q: "Kirchhoff's Voltage Law (KVL) is based on conservation of:", options: ['Charge', 'Energy', 'Power', 'Flux'], answer: 1, explanation: 'KVL — conservation of energy around a loop.' },
  { id: 'ec5', subject: 'ec', q: 'Two equal resistors R connected in parallel give a total resistance of:', options: ['2R', 'R', 'R/2', 'R/4'], answer: 2, explanation: 'Parallel of two equal R = R/2.' },
  { id: 'ec6', subject: 'ec', q: 'The time constant of an R-C circuit is:', options: ['R/C', 'RC', 'C/R', '1/RC'], answer: 1, explanation: 'Time constant τ = R × C.' },
  { id: 'ec7', subject: 'ec', q: 'The resonant frequency of a series RLC circuit is:', options: ['1/(2π√(LC))', '2π√(LC)', '1/(2πLC)', '√(LC)/2π'], answer: 0, explanation: 'f₀ = 1 / (2π√(LC)).' },
  { id: 'ec8', subject: 'ec', q: 'In a pure capacitor, the current:', options: ['Lags voltage by 90°', 'Leads voltage by 90°', 'Is in phase with voltage', 'Leads by 45°'], answer: 1, explanation: 'Capacitor current leads voltage by 90°.' },
  { id: 'ec9', subject: 'ec', q: 'In a pure inductor, the current:', options: ['Leads voltage by 90°', 'Lags voltage by 90°', 'Is in phase', 'Lags by 45°'], answer: 1, explanation: 'Inductor current lags voltage by 90°.' },
  { id: 'ec10', subject: 'ec', q: 'The Maximum Power Transfer theorem states that maximum power is delivered when load resistance equals:', options: ['Zero', 'Infinity', 'Source internal resistance', 'Twice the source resistance'], answer: 2, explanation: 'R_L = R_source (internal) for maximum power transfer.' },
  { id: 'ec11', subject: 'ec', q: 'The power factor of a purely resistive AC circuit is:', options: ['Zero', '0.5', 'Unity (1)', 'Infinite'], answer: 2, explanation: 'Voltage and current in phase ⇒ pf = 1.' },
  { id: 'ec12', subject: 'ec', q: 'The SI unit of capacitance is the:', options: ['Henry', 'Farad', 'Weber', 'Tesla'], answer: 1, explanation: 'Capacitance in farads (F).' },
  { id: 'ec13', subject: 'ec', q: 'The SI unit of inductance is the:', options: ['Farad', 'Henry', 'Ohm', 'Weber'], answer: 1, explanation: 'Inductance in henries (H).' },
  { id: 'ec14', subject: 'ec', q: 'For a balanced 3-phase system, total power P equals:', options: ['VL × IL', '√3 × VL × IL × cosφ', '3 × VL × IL', 'VL × IL × cosφ'], answer: 1, explanation: 'P = √3 · V_L · I_L · cosφ.' },

  // ---------- Electrical Machines ----------
  { id: 'em1', subject: 'em', q: 'A transformer works on the principle of:', options: ['Self induction', 'Mutual induction', "Ohm's law", "Coulomb's law"], answer: 1, explanation: 'Energy transfers between windings via mutual induction.' },
  { id: 'em2', subject: 'em', q: 'A transformer changes voltage and current but does NOT change the:', options: ['Power', 'Frequency', 'Turns ratio', 'Flux'], answer: 1, explanation: 'Supply frequency stays unchanged.' },
  { id: 'em3', subject: 'em', q: 'The EMF equation of a transformer is E =', options: ['4.44 f N φ', '2.22 f N φ', 'f N φ', '4.44 N φ'], answer: 0, explanation: 'E = 4.44 · f · N · φ_max.' },
  { id: 'em4', subject: 'em', q: 'In a DC motor, the back EMF is proportional to the:', options: ['Armature resistance', 'Speed of the motor', 'Supply frequency', 'Number of brushes'], answer: 1, explanation: 'Eb ∝ φN — proportional to speed (for constant flux).' },
  { id: 'em5', subject: 'em', q: 'The synchronous speed of an AC machine is given by:', options: ['120 f / P', 'f P / 120', '60 f / P', '120 P / f'], answer: 0, explanation: 'Ns = 120 f / P (P = number of poles).' },
  { id: 'em6', subject: 'em', q: 'The slip of a 3-phase induction motor at standstill is:', options: ['0', '0.5', '1', 'Infinite'], answer: 2, explanation: 'At standstill, N = 0, so slip s = 1 (100%).' },
  { id: 'em7', subject: 'em', q: 'In a DC generator, the commutator acts as a:', options: ['Voltage amplifier', 'Mechanical rectifier', 'Transformer', 'Filter'], answer: 1, explanation: 'The commutator converts internal AC to DC (mechanical rectifier).' },
  { id: 'em8', subject: 'em', q: 'The direction of an induced EMF/current is given by:', options: ["Ohm's law", "Lenz's law", "Kirchhoff's law", "Coulomb's law"], answer: 1, explanation: "Lenz's law — induced current opposes the change causing it." },
  { id: 'em9', subject: 'em', q: 'An auto-transformer has:', options: ['Two separate windings', 'A single winding', 'Three windings', 'No winding'], answer: 1, explanation: 'An auto-transformer uses a single tapped winding.' },
  { id: 'em10', subject: 'em', q: 'Which machine runs at constant (synchronous) speed regardless of load?', options: ['DC series motor', 'Induction motor', 'Synchronous motor', 'Universal motor'], answer: 2, explanation: 'A synchronous motor runs at synchronous speed.' },
  { id: 'em11', subject: 'em', q: 'The iron (core) loss in a transformer is:', options: ['Proportional to load', 'Practically constant', 'Zero at no load', 'Maximum at no load only'], answer: 1, explanation: 'Iron loss is nearly constant (depends on supply, not load).' },

  // ---------- Power Systems ----------
  { id: 'ps1', subject: 'ps', q: 'Electric power is transmitted at high voltage mainly to:', options: ['Increase current', 'Reduce line losses', 'Increase frequency', 'Reduce voltage'], answer: 1, explanation: 'Higher voltage ⇒ lower current ⇒ lower I²R losses.' },
  { id: 'ps2', subject: 'ps', q: 'The frequency of AC supply in India is:', options: ['40 Hz', '50 Hz', '60 Hz', '100 Hz'], answer: 1, explanation: 'Standard supply frequency is 50 Hz.' },
  { id: 'ps3', subject: 'ps', q: 'The corona effect in transmission lines occurs mainly at:', options: ['Low voltage', 'High voltage', 'DC only', 'Low frequency'], answer: 1, explanation: 'Corona (ionisation of air) occurs at high voltages.' },
  { id: 'ps4', subject: 'ps', q: 'Skin effect in a conductor increases with:', options: ['Decrease in frequency', 'Increase in frequency', 'Decrease in area', 'DC supply'], answer: 1, explanation: 'Skin effect increases with frequency.' },
  { id: 'ps5', subject: 'ps', q: 'Power factor of a system is usually improved by connecting:', options: ['Inductors in series', 'Capacitors in parallel', 'Resistors in series', 'A second generator'], answer: 1, explanation: 'Shunt capacitors supply reactive power, improving pf.' },
  { id: 'ps6', subject: 'ps', q: 'A per-unit quantity is defined as:', options: ['Actual value × base value', 'Actual value / base value', 'Base value / actual value', 'Actual value + base value'], answer: 1, explanation: 'Per-unit = actual value / base value.' },
  { id: 'ps7', subject: 'ps', q: 'String insulators are used for:', options: ['Underground cables', 'Suspension of overhead line conductors', 'Earthing', 'Power factor correction'], answer: 1, explanation: 'Suspension (string) insulators support overhead conductors.' },
  { id: 'ps8', subject: 'ps', q: 'A fuse is always connected in the circuit in:', options: ['Parallel', 'Series', 'Star', 'Delta'], answer: 1, explanation: 'A fuse is in series to break the circuit on overcurrent.' },
  { id: 'ps9', subject: 'ps', q: 'The standard low-tension (LT) 3-phase distribution voltage in India is about:', options: ['230 V', '400 V', '11 kV', '66 kV'], answer: 1, explanation: 'LT 3-phase ≈ 400 V (line), 230 V per phase.' },

  // ---------- Measurements ----------
  { id: 'me1', subject: 'meas', q: 'An ammeter is connected in the circuit in:', options: ['Series', 'Parallel', 'Star', 'Delta'], answer: 0, explanation: 'Ammeters are connected in series.' },
  { id: 'me2', subject: 'meas', q: 'A voltmeter is connected in the circuit in:', options: ['Series', 'Parallel', 'Star', 'Delta'], answer: 1, explanation: 'Voltmeters are connected in parallel (across the element).' },
  { id: 'me3', subject: 'meas', q: 'A PMMC instrument can directly measure:', options: ['AC only', 'DC only', 'Both equally', 'Neither'], answer: 1, explanation: 'PMMC responds to average value — used for DC.' },
  { id: 'me4', subject: 'meas', q: 'A moving-iron instrument can measure:', options: ['DC only', 'AC only', 'Both AC and DC', 'Neither'], answer: 2, explanation: 'Moving-iron instruments read both AC and DC.' },
  { id: 'me5', subject: 'meas', q: 'To extend the range of an ammeter, we use a:', options: ['Series multiplier', 'Shunt (parallel) resistor', 'Capacitor', 'Inductor'], answer: 1, explanation: 'A low-value shunt in parallel extends ammeter range.' },
  { id: 'me6', subject: 'meas', q: 'To extend the range of a voltmeter, we use a:', options: ['Shunt in parallel', 'Multiplier in series', 'Capacitor', 'Transformer'], answer: 1, explanation: 'A high-value multiplier in series extends voltmeter range.' },
  { id: 'me7', subject: 'meas', q: 'An energy meter measures:', options: ['Power', 'Energy (kWh)', 'Current', 'Frequency'], answer: 1, explanation: 'An energy meter records energy in kilowatt-hours.' },
  { id: 'me8', subject: 'meas', q: 'A Q-meter is used to measure the:', options: ['Power factor', 'Quality factor', 'Frequency', 'Phase angle'], answer: 1, explanation: 'A Q-meter measures the quality factor (Q) of coils/circuits.' },
  { id: 'me9', subject: 'meas', q: 'A cathode ray oscilloscope (CRO) is used mainly to:', options: ['Measure energy', 'Display waveforms', 'Improve power factor', 'Rectify AC'], answer: 1, explanation: 'A CRO displays voltage waveforms vs time.' },

  // ---------- Control Systems ----------
  { id: 'cs1', subject: 'cs', q: 'The transfer function of a system is the ratio of output to input in the s-domain, assuming:', options: ['Non-zero initial conditions', 'Zero initial conditions', 'AC input only', 'DC input only'], answer: 1, explanation: 'Transfer function assumes zero initial conditions.' },
  { id: 'cs2', subject: 'cs', q: 'The Routh–Hurwitz criterion is used to determine system:', options: ['Accuracy', 'Stability', 'Sensitivity', 'Bandwidth'], answer: 1, explanation: 'Routh–Hurwitz checks stability from the characteristic equation.' },
  { id: 'cs3', subject: 'cs', q: 'For a stable linear system, the roots of the characteristic equation must lie in the:', options: ['Right half of the s-plane', 'Left half of the s-plane', 'Origin', 'Imaginary axis'], answer: 1, explanation: 'All poles must have negative real parts (left half plane).' },
  { id: 'cs4', subject: 'cs', q: 'The "type" of a control system is equal to the number of:', options: ['Zeros at the origin', 'Poles at the origin', 'Poles in RHP', 'Feedback loops'], answer: 1, explanation: 'System type = number of poles at the origin (s = 0).' },
  { id: 'cs5', subject: 'cs', q: 'In a Bode plot, the magnitude is usually plotted in:', options: ['Volts', 'Decibels (dB)', 'Radians', 'Watts'], answer: 1, explanation: 'Bode magnitude is in dB vs log frequency.' },
  { id: 'cs6', subject: 'cs', q: 'Negative feedback in a control system generally:', options: ['Increases gain', 'Reduces gain but improves stability', 'Removes all error', 'Has no effect'], answer: 1, explanation: 'Negative feedback lowers gain while improving stability/bandwidth.' },
  { id: 'cs7', subject: 'cs', q: 'In an open-loop control system, the output is:', options: ['Fed back to the input', 'Not fed back to the input', 'Always zero', 'Always unstable'], answer: 1, explanation: 'Open-loop systems have no feedback of the output.' },

  // ---------- Power Electronics & Drives ----------
  { id: 'pe1', subject: 'pe', q: 'An SCR (thyristor) is a:', options: ['2-layer device', '3-layer device', '4-layer (PNPN) device', '5-layer device'], answer: 2, explanation: 'An SCR is a four-layer PNPN device with three junctions.' },
  { id: 'pe2', subject: 'pe', q: 'An SCR is normally turned ON by applying a signal to its:', options: ['Anode', 'Cathode', 'Gate', 'Base'], answer: 2, explanation: 'A gate trigger pulse turns the SCR on.' },
  { id: 'pe3', subject: 'pe', q: 'A rectifier converts:', options: ['DC to AC', 'AC to DC', 'DC to DC', 'AC to AC'], answer: 1, explanation: 'A rectifier converts AC to DC.' },
  { id: 'pe4', subject: 'pe', q: 'An inverter converts:', options: ['AC to DC', 'DC to AC', 'DC to DC', 'AC to AC'], answer: 1, explanation: 'An inverter converts DC to AC.' },
  { id: 'pe5', subject: 'pe', q: 'A chopper is used to convert:', options: ['Fixed DC to variable DC', 'AC to DC', 'DC to AC', 'Fixed AC to variable AC'], answer: 0, explanation: 'A chopper converts fixed DC into variable DC.' },
  { id: 'pe6', subject: 'pe', q: 'An IGBT combines the features of a:', options: ['BJT and MOSFET', 'Diode and SCR', 'Two diodes', 'TRIAC and diode'], answer: 0, explanation: 'IGBT = MOSFET input + BJT output characteristics.' },
  { id: 'pe7', subject: 'pe', q: 'A TRIAC conducts current in:', options: ['One direction only', 'Both directions', 'No direction', 'Only when reverse biased'], answer: 1, explanation: 'A TRIAC conducts in both directions (bidirectional).' },
  { id: 'pe8', subject: 'pe', q: 'A diode conducts current when it is:', options: ['Reverse biased', 'Forward biased', 'Unbiased', 'At high frequency'], answer: 1, explanation: 'A diode conducts when forward biased.' },

  // ---------- Analog & Digital Electronics ----------
  { id: 'ad1', subject: 'ade', q: 'The input impedance of an ideal operational amplifier is:', options: ['Zero', 'Infinite', 'Equal to output impedance', '50 Ω'], answer: 1, explanation: 'An ideal op-amp has infinite input impedance.' },
  { id: 'ad2', subject: 'ade', q: 'The open-loop voltage gain of an ideal op-amp is:', options: ['Zero', 'One', 'Infinite', 'Ten'], answer: 2, explanation: 'Ideal op-amp open-loop gain is infinite.' },
  { id: 'ad3', subject: 'ade', q: 'Which logic gate is called a "universal" gate?', options: ['AND', 'OR', 'NAND', 'NOT'], answer: 2, explanation: 'NAND (and NOR) are universal gates.' },
  { id: 'ad4', subject: 'ade', q: 'The binary equivalent of decimal 5 is:', options: ['100', '101', '110', '111'], answer: 1, explanation: '5 = 101 in binary.' },
  { id: 'ad5', subject: 'ade', q: 'The decimal equivalent of binary 1010 is:', options: ['8', '10', '12', '20'], answer: 1, explanation: '1010₂ = 8 + 2 = 10.' },
  { id: 'ad6', subject: 'ade', q: 'How many bits are there in one byte?', options: ['4', '8', '16', '32'], answer: 1, explanation: '1 byte = 8 bits.' },
  { id: 'ad7', subject: 'ade', q: 'A flip-flop can store:', options: ['1 bit', '2 bits', '4 bits', '8 bits'], answer: 0, explanation: 'A single flip-flop stores 1 bit.' },
  { id: 'ad8', subject: 'ade', q: 'A Zener diode is commonly used for:', options: ['Amplification', 'Voltage regulation', 'Rectification only', 'Oscillation'], answer: 1, explanation: 'A Zener diode maintains a constant voltage (regulation).' },
  { id: 'ad9', subject: 'ade', q: 'A full adder adds how many input bits at a time?', options: ['2', '3', '4', '1'], answer: 1, explanation: 'A full adder adds three bits (A, B, carry-in).' },
]
