/**
 * Form submission service for Monday.com forms.
 *
 * Submits directly to Monday.com's WorkForms submissions API
 * rather than automating a browser.
 */

import { sendEmail } from './mailgun.js';

const FORM_1_URL = process.env.MONDAY_FORM_1_URL ?? '';

// Form 1 token and submissions API endpoint (derived from URL)
const FORM_1_TOKEN = FORM_1_URL.split('/').pop() ?? '';
const FORM_1_SUBMISSIONS_URL = `https://forms.monday.com/workforms/external/forms/${FORM_1_TOKEN}/submissions?r=use1`;

// Form 1: field IDs (from Monday.com form structure)
// Customize: Replace the empty strings below with your actual Monday.com field IDs
const FORM_1_FIELD_NAME = 'name';
const FORM_1_FIELD_EMAIL = ''; // Customize: email field ID
const FORM_1_FIELD_PHONE = ''; // Customize: phone field ID
const FORM_1_FIELD_GROUP_SIZE = ''; // Customize: group size dropdown field ID

const FORM_2_URL = process.env.MONDAY_FORM_2_URL ?? '';

// Form 2 token (derived from URL)
const FORM_2_TOKEN = FORM_2_URL.split('/').pop() ?? '';

// Form 2: Monday.com submissions API endpoint
const FORM_2_SUBMISSIONS_URL = `https://forms.monday.com/workforms/external/forms/${FORM_2_TOKEN}/submissions?r=use1`;

// Form 2: field IDs (from Monday.com form structure)
// Customize: Replace the empty strings below with your actual Monday.com field IDs
const FORM_2_FIELD_VOLUNTEER_NAME = 'name';
const FORM_2_FIELD_MEMBER_NAME = ''; // Customize: member name field ID
const FORM_2_FIELD_CLASS_YEAR = ''; // Customize: class year dropdown field ID
const FORM_2_FIELD_UPDATE_TYPE = ''; // Customize: update type dropdown field ID
const FORM_2_FIELD_NEW_EMAIL = ''; // Customize: new email field ID
const FORM_2_FIELD_CLASS_COMMS = ''; // Customize: class communications dropdown field ID

// Form 2: dropdown option indices
// Customize: Replace these with the correct 0-based indices for your Monday.com form dropdowns
const FORM_2_OPTION_CLASS_YEAR = 0; // Customize: index for the relevant class year option
const FORM_2_UPDATE_EMAIL = 0; // Customize: index for "update email" option
const FORM_2_UPDATE_SOCIAL_CLASS = 0; // Customize: index for "update social class" option
const FORM_2_COMMS_YES = 0; // Customize: index for "yes" in communications opt-in

// Hardcoded field values for forms — overridable via env vars
const VOLUNTEER_NAME = process.env.FORM_VOLUNTEER_NAME ?? '🤖 ClassDesk';

// When true, all form fills return a dry-run success without actually submitting.
const DRY_RUN = process.env.FORM_DRY_RUN === 'true';

// Map E.164 calling codes to Monday.com's countryShortName (ISO 3166-1 alpha-2).
// Includes all countries and territories. For shared codes (e.g. +1 = US/CA),
// the primary/largest country is used; longer territory prefixes (e.g. +1264 = AI)
// are matched first via longest-prefix matching in parsePhone().
const CALLING_CODE_TO_COUNTRY: Record<string, string> = {
  // 1-digit codes
  '1': 'US', // United States (also Canada)
  '7': 'RU', // Russia (also Kazakhstan +77)

  // 2-digit codes
  '20': 'EG', // Egypt
  '27': 'ZA', // South Africa
  '30': 'GR', // Greece
  '31': 'NL', // Netherlands
  '32': 'BE', // Belgium
  '33': 'FR', // France
  '34': 'ES', // Spain
  '36': 'HU', // Hungary
  '39': 'IT', // Italy
  '40': 'RO', // Romania
  '41': 'CH', // Switzerland
  '43': 'AT', // Austria
  '44': 'GB', // United Kingdom
  '45': 'DK', // Denmark
  '46': 'SE', // Sweden
  '47': 'NO', // Norway
  '48': 'PL', // Poland
  '49': 'DE', // Germany
  '51': 'PE', // Peru
  '52': 'MX', // Mexico
  '53': 'CU', // Cuba
  '54': 'AR', // Argentina
  '55': 'BR', // Brazil
  '56': 'CL', // Chile
  '57': 'CO', // Colombia
  '58': 'VE', // Venezuela
  '60': 'MY', // Malaysia
  '61': 'AU', // Australia
  '62': 'ID', // Indonesia
  '63': 'PH', // Philippines
  '64': 'NZ', // New Zealand
  '65': 'SG', // Singapore
  '66': 'TH', // Thailand
  '77': 'KZ', // Kazakhstan
  '81': 'JP', // Japan
  '82': 'KR', // South Korea
  '84': 'VN', // Vietnam
  '86': 'CN', // China
  '90': 'TR', // Turkey
  '91': 'IN', // India
  '92': 'PK', // Pakistan
  '93': 'AF', // Afghanistan
  '94': 'LK', // Sri Lanka
  '95': 'MM', // Myanmar
  '98': 'IR', // Iran

  // 3-digit codes
  '211': 'SS', // South Sudan
  '212': 'MA', // Morocco
  '213': 'DZ', // Algeria
  '216': 'TN', // Tunisia
  '218': 'LY', // Libya
  '220': 'GM', // Gambia
  '221': 'SN', // Senegal
  '222': 'MR', // Mauritania
  '223': 'ML', // Mali
  '224': 'GN', // Guinea
  '225': 'CI', // Ivory Coast
  '226': 'BF', // Burkina Faso
  '227': 'NE', // Niger
  '228': 'TG', // Togo
  '229': 'BJ', // Benin
  '230': 'MU', // Mauritius
  '231': 'LR', // Liberia
  '232': 'SL', // Sierra Leone
  '233': 'GH', // Ghana
  '234': 'NG', // Nigeria
  '235': 'TD', // Chad
  '236': 'CF', // Central African Republic
  '237': 'CM', // Cameroon
  '238': 'CV', // Cape Verde
  '239': 'ST', // São Tomé and Príncipe
  '240': 'GQ', // Equatorial Guinea
  '241': 'GA', // Gabon
  '242': 'CG', // Republic of the Congo
  '243': 'CD', // DR Congo
  '244': 'AO', // Angola
  '245': 'GW', // Guinea-Bissau
  '246': 'IO', // British Indian Ocean Territory
  '248': 'SC', // Seychelles
  '249': 'SD', // Sudan
  '250': 'RW', // Rwanda
  '251': 'ET', // Ethiopia
  '252': 'SO', // Somalia
  '253': 'DJ', // Djibouti
  '254': 'KE', // Kenya
  '255': 'TZ', // Tanzania
  '256': 'UG', // Uganda
  '257': 'BI', // Burundi
  '258': 'MZ', // Mozambique
  '260': 'ZM', // Zambia
  '261': 'MG', // Madagascar
  '262': 'RE', // Réunion (also Mayotte)
  '263': 'ZW', // Zimbabwe
  '264': 'NA', // Namibia
  '265': 'MW', // Malawi
  '266': 'LS', // Lesotho
  '267': 'BW', // Botswana
  '268': 'SZ', // Eswatini
  '269': 'KM', // Comoros
  '290': 'SH', // Saint Helena
  '291': 'ER', // Eritrea
  '297': 'AW', // Aruba
  '298': 'FO', // Faroe Islands
  '299': 'GL', // Greenland
  '345': 'KY', // Cayman Islands
  '350': 'GI', // Gibraltar
  '351': 'PT', // Portugal
  '352': 'LU', // Luxembourg
  '353': 'IE', // Ireland
  '354': 'IS', // Iceland
  '355': 'AL', // Albania
  '356': 'MT', // Malta
  '357': 'CY', // Cyprus
  '358': 'FI', // Finland (also Åland Islands)
  '359': 'BG', // Bulgaria
  '370': 'LT', // Lithuania
  '371': 'LV', // Latvia
  '372': 'EE', // Estonia
  '373': 'MD', // Moldova
  '374': 'AM', // Armenia
  '375': 'BY', // Belarus
  '376': 'AD', // Andorra
  '377': 'MC', // Monaco
  '378': 'SM', // San Marino
  '379': 'VA', // Vatican City
  '380': 'UA', // Ukraine
  '381': 'RS', // Serbia
  '382': 'ME', // Montenegro
  '385': 'HR', // Croatia
  '386': 'SI', // Slovenia
  '387': 'BA', // Bosnia and Herzegovina
  '389': 'MK', // North Macedonia
  '420': 'CZ', // Czech Republic
  '421': 'SK', // Slovakia
  '423': 'LI', // Liechtenstein
  '500': 'FK', // Falkland Islands
  '501': 'BZ', // Belize
  '502': 'GT', // Guatemala
  '503': 'SV', // El Salvador
  '504': 'HN', // Honduras
  '505': 'NI', // Nicaragua
  '506': 'CR', // Costa Rica
  '507': 'PA', // Panama
  '508': 'PM', // Saint Pierre and Miquelon
  '509': 'HT', // Haiti
  '590': 'GP', // Guadeloupe (also Saint Barthélemy, Saint Martin)
  '591': 'BO', // Bolivia
  '593': 'EC', // Ecuador
  '594': 'GF', // French Guiana
  '595': 'PY', // Paraguay
  '596': 'MQ', // Martinique
  '597': 'SR', // Suriname
  '598': 'UY', // Uruguay
  '599': 'CW', // Curaçao (formerly Netherlands Antilles)
  '670': 'TL', // Timor-Leste
  '672': 'NF', // Norfolk Island (also Antarctica)
  '673': 'BN', // Brunei
  '674': 'NR', // Nauru
  '675': 'PG', // Papua New Guinea
  '676': 'TO', // Tonga
  '677': 'SB', // Solomon Islands
  '678': 'VU', // Vanuatu
  '679': 'FJ', // Fiji
  '680': 'PW', // Palau
  '681': 'WF', // Wallis and Futuna
  '682': 'CK', // Cook Islands
  '683': 'NU', // Niue
  '685': 'WS', // Samoa
  '686': 'KI', // Kiribati
  '687': 'NC', // New Caledonia
  '688': 'TV', // Tuvalu
  '689': 'PF', // French Polynesia
  '690': 'TK', // Tokelau
  '691': 'FM', // Micronesia
  '692': 'MH', // Marshall Islands
  '850': 'KP', // North Korea
  '852': 'HK', // Hong Kong
  '853': 'MO', // Macau
  '855': 'KH', // Cambodia
  '856': 'LA', // Laos
  '872': 'PN', // Pitcairn Islands
  '880': 'BD', // Bangladesh
  '886': 'TW', // Taiwan
  '960': 'MV', // Maldives
  '961': 'LB', // Lebanon
  '962': 'JO', // Jordan
  '963': 'SY', // Syria
  '964': 'IQ', // Iraq
  '965': 'KW', // Kuwait
  '966': 'SA', // Saudi Arabia
  '967': 'YE', // Yemen
  '968': 'OM', // Oman
  '970': 'PS', // Palestine
  '971': 'AE', // UAE
  '972': 'IL', // Israel
  '973': 'BH', // Bahrain
  '974': 'QA', // Qatar
  '975': 'BT', // Bhutan
  '976': 'MN', // Mongolia
  '977': 'NP', // Nepal
  '992': 'TJ', // Tajikistan
  '993': 'TM', // Turkmenistan
  '994': 'AZ', // Azerbaijan
  '995': 'GE', // Georgia
  '996': 'KG', // Kyrgyzstan
  '998': 'UZ', // Uzbekistan

  // 4-digit codes (Caribbean +1 territories and others)
  '1242': 'BS', // Bahamas
  '1246': 'BB', // Barbados
  '1264': 'AI', // Anguilla
  '1268': 'AG', // Antigua and Barbuda
  '1284': 'VG', // British Virgin Islands
  '1340': 'VI', // US Virgin Islands
  '1441': 'BM', // Bermuda
  '1473': 'GD', // Grenada
  '1649': 'TC', // Turks and Caicos Islands
  '1664': 'MS', // Montserrat
  '1670': 'MP', // Northern Mariana Islands
  '1671': 'GU', // Guam
  '1684': 'AS', // American Samoa
  '1758': 'LC', // Saint Lucia
  '1767': 'DM', // Dominica
  '1784': 'VC', // Saint Vincent and the Grenadines
  '1849': 'DO', // Dominican Republic
  '1868': 'TT', // Trinidad and Tobago
  '1869': 'KN', // Saint Kitts and Nevis
  '1876': 'JM', // Jamaica
  '1939': 'PR', // Puerto Rico
};

/**
 * Parse a phone string into { phone, countryShortName } for Monday.com.
 * Only attempts country code detection when the input starts with "+".
 * Without a "+" prefix, the number is assumed to be a US domestic number.
 */
const parsePhone = (raw: string): { phone: string; countryShortName: string } => {
  const digits = raw.replace(/\D/g, '');
  const hasCountryCode = raw.trimStart().startsWith('+');

  if (hasCountryCode) {
    // Try matching longest prefix first (4-digit, 3-digit, 2-digit, 1-digit codes)
    for (const len of [4, 3, 2, 1]) {
      const prefix = digits.slice(0, len);
      const country = CALLING_CODE_TO_COUNTRY[prefix];
      if (country) {
        return { phone: digits, countryShortName: country };
      }
    }
  }

  return { phone: digits, countryShortName: 'US' };
};

export interface MondayForm1Data {
  name: string;
  email: string;
  phone: string;
  groupSize: 2 | 3 | 4 | 5 | 6;
}

export interface MondayForm2Data {
  memberName: string;
  /** The member's class year as a string */
  classYear: string;
  newEmail: string;
}

export interface FormFillResult {
  success: boolean;
  message: string;
  /** Technical detail only logged server-side, not shown to users */
  error?: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const fillMondayForm1 = async (data: MondayForm1Data): Promise<FormFillResult> => {
  if (DRY_RUN) {
    return { success: true, message: 'Succeeded dry run' };
  }

  const phoneParsed = parsePhone(data.phone);

  // Monday.com dropdown is 1-indexed: 2 People → [1], 3 People → [2], … 6 People → [5]
  const groupSizeIndex = data.groupSize - 1;

  // Use sequential assignment to avoid TS1117 duplicate-key errors when field IDs are empty strings
  const answers: Record<string, unknown> = {};
  answers[FORM_1_FIELD_NAME] = data.name;
  answers[FORM_1_FIELD_EMAIL] = data.email;
  answers[FORM_1_FIELD_PHONE] = phoneParsed;
  answers[FORM_1_FIELD_GROUP_SIZE] = [groupSizeIndex];

  const body = {
    answers,
    'form-timezone-offset': new Date().getTimezoneOffset(),
    tags: [],
  };

  console.log(
    `[formFiller] Submitting Monday Form 1 via API for ${data.name} (group of ${data.groupSize})`,
  );

  try {
    const response = await fetch(FORM_1_SUBMISSIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://forms.monday.com',
        Referer: FORM_1_URL,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[formFiller] Monday.com response: ${response.status} ${responseText}`);

    if (!response.ok) {
      console.error(
        `[formFiller] ❌ Monday.com rejected submission: ${response.status} ${responseText}`,
      );
      throw new Error(`Monday.com returned ${response.status}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    if (result.id) {
      console.log(`[formFiller] ✅ Monday Form 1 submitted successfully (id: ${result.id})`);
      void sendEmail(
        data.email,
        'Form 1 submitted',
        `Hi ${data.name},\n\nI have submitted your request for a group of ${data.groupSize}. You will receive follow-up communications as needed.\n\nBest,\nClassDesk`,
      );
      return {
        success: true,
        message: `I have submitted your request for a group of ${data.groupSize}. You will receive follow-up communications as needed.`,
      };
    }

    console.error(`[formFiller] ❌ Unexpected response format: ${responseText}`);
    throw new Error('Unexpected response from Monday.com');
  } catch (error) {
    console.error('[formFiller] fillMondayForm1 error:', error);
    return {
      success: false,
      message:
        'There was a problem submitting Monday Form 1. Please try again or visit the form directly.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const fillMondayForm2 = async (data: MondayForm2Data): Promise<FormFillResult> => {
  if (DRY_RUN) {
    return { success: true, message: 'Succeeded dry run' };
  }

  // Build the answers object matching Monday.com's form field IDs.
  // Use sequential assignment to avoid TS1117 duplicate-key errors when field IDs are empty strings.
  const updateTypes = [FORM_2_UPDATE_EMAIL, FORM_2_UPDATE_SOCIAL_CLASS];

  const answers: Record<string, unknown> = {};
  answers[FORM_2_FIELD_VOLUNTEER_NAME] = VOLUNTEER_NAME;
  answers[FORM_2_FIELD_MEMBER_NAME] = data.memberName;
  answers[FORM_2_FIELD_CLASS_YEAR] = [FORM_2_OPTION_CLASS_YEAR];
  answers[FORM_2_FIELD_UPDATE_TYPE] = updateTypes;
  answers[FORM_2_FIELD_NEW_EMAIL] = data.newEmail;
  answers[FORM_2_FIELD_CLASS_COMMS] = [FORM_2_COMMS_YES];

  const body = {
    answers,
    'form-timezone-offset': new Date().getTimezoneOffset(),
    tags: [],
  };

  console.log(`[formFiller] Submitting Monday Form 2 via API for ${data.memberName}`);

  try {
    const response = await fetch(FORM_2_SUBMISSIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://forms.monday.com',
        Referer: FORM_2_URL,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    console.log(`[formFiller] Monday.com response: ${response.status} ${responseText}`);

    if (!response.ok) {
      console.error(
        `[formFiller] ❌ Monday.com rejected submission: ${response.status} ${responseText}`,
      );
      throw new Error(`Monday.com returned ${response.status}: ${responseText}`);
    }

    // Monday.com returns {"id":"..."} on success
    const result = JSON.parse(responseText);
    if (result.id) {
      console.log(`[formFiller] ✅ Monday Form 2 submitted successfully (id: ${result.id})`);
      void sendEmail(
        data.newEmail,
        'Form 2 submitted',
        `Hi ${data.memberName},\n\nI have submitted your request to update your email address to ${data.newEmail}. The update will be made after a manual review, and then you will receive future class communications.\n\nBest,\nClassDesk`,
      );
      return {
        success: true,
        message: `I have submitted your request to update your email address to ${data.newEmail}. The update will be made after a manual review, and then you will receive future class communications.`,
      };
    }

    console.error(`[formFiller] ❌ Unexpected response format: ${responseText}`);
    throw new Error('Unexpected response from Monday.com');
  } catch (error) {
    console.error('[formFiller] fillMondayForm2 error:', error);
    return {
      success: false,
      message:
        'There was a problem submitting Monday Form 2. Please try again or visit the form directly.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
