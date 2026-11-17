// Veille privée : reconnaître un nom de pays et donner son centre approximatif.
// Tout se fait dans le navigateur, rien n'est transmis à un service extérieur.
// Format d'une ligne : code ISO | nom français | nom anglais | longitude | latitude | autres écritures
// Les centres sont approximatifs : ils servent à poser un point « au centre du pays »
// quand le fichier ne donne pas de coordonnées.

const TABLE = `
AF|Afghanistan|Afghanistan|66|33.9|
ZA|Afrique du Sud|South Africa|24.7|-29|rsa
AL|Albanie|Albania|20.1|41.1|
DZ|Algérie|Algeria|2.6|28.2|
DE|Allemagne|Germany|10.4|51.1|deutschland
AD|Andorre|Andorra|1.6|42.5|
AO|Angola|Angola|17.5|-12.3|
SA|Arabie saoudite|Saudi Arabia|44.5|24.1|ksa
AR|Argentine|Argentina|-64.9|-35.4|
AM|Arménie|Armenia|44.9|40.3|
AU|Australie|Australia|134.5|-25.7|
AT|Autriche|Austria|14.1|47.6|
AZ|Azerbaïdjan|Azerbaijan|47.7|40.3|
BS|Bahamas|Bahamas|-77.9|24.7|
BH|Bahreïn|Bahrain|50.55|26.05|
BD|Bangladesh|Bangladesh|90.3|23.8|
BE|Belgique|Belgium|4.6|50.6|
BZ|Belize|Belize|-88.7|17.2|
BJ|Bénin|Benin|2.3|9.6|
BT|Bhoutan|Bhutan|90.4|27.4|
BY|Biélorussie|Belarus|28|53.5|belarus
MM|Birmanie|Myanmar|96.5|21.2|burma
BO|Bolivie|Bolivia|-64.7|-16.7|
BA|Bosnie-Herzégovine|Bosnia and Herzegovina|17.8|44.2|bosnie;bosnia
BW|Botswana|Botswana|23.8|-22.2|
BR|Brésil|Brazil|-53.1|-10.8|brasil
BN|Brunei|Brunei|114.7|4.5|
BG|Bulgarie|Bulgaria|25.2|42.8|
BF|Burkina Faso|Burkina Faso|-1.7|12.3|burkina
BI|Burundi|Burundi|29.9|-3.4|
KH|Cambodge|Cambodia|104.9|12.7|
CM|Cameroun|Cameroon|12.7|5.7|
CA|Canada|Canada|-98.3|61.4|
CV|Cap-Vert|Cape Verde|-23.6|15.1|cabo verde
CF|République centrafricaine|Central African Republic|20.5|6.6|centrafrique;rca;car
CL|Chili|Chile|-71.4|-37.7|
CN|Chine|China|103.8|36.6|
CY|Chypre|Cyprus|33.2|35|
CO|Colombie|Colombia|-73.1|3.9|
KM|Comores|Comoros|43.7|-11.9|
CG|Congo|Congo|15.2|-0.8|republique du congo;congo brazzaville;republic of the congo
CD|République démocratique du Congo|Democratic Republic of the Congo|23.6|-2.9|rdc;rd congo;drc;congo kinshasa;dr congo
KP|Corée du Nord|North Korea|127.2|40.2|
KR|Corée du Sud|South Korea|127.8|36.4|coree;korea
CR|Costa Rica|Costa Rica|-84.2|9.9|
CI|Côte d'Ivoire|Ivory Coast|-5.6|7.6|cote d ivoire;cote divoire
HR|Croatie|Croatia|16.4|45.1|
CU|Cuba|Cuba|-79|21.6|
DK|Danemark|Denmark|10|56|
DJ|Djibouti|Djibouti|42.6|11.7|
EG|Égypte|Egypt|29.9|26.5|
AE|Émirats arabes unis|United Arab Emirates|54.3|23.9|emirats;eau;uae
EC|Équateur|Ecuador|-78.8|-1.4|
ER|Érythrée|Eritrea|38.8|15.4|
ES|Espagne|Spain|-3.6|40.2|
EE|Estonie|Estonia|25.5|58.7|
SZ|Eswatini|Eswatini|31.5|-26.6|swaziland
US|États-Unis|United States|-98.6|39.8|usa;etats unis d amerique;united states of america;us
ET|Éthiopie|Ethiopia|39.6|8.6|
FJ|Fidji|Fiji|178|-17.8|
FI|Finlande|Finland|26.3|64.5|
FR|France|France|2.5|46.6|
GA|Gabon|Gabon|11.8|-0.6|
GM|Gambie|Gambia|-15.4|13.4|
GE|Géorgie|Georgia|43.5|42.2|
GH|Ghana|Ghana|-1.2|7.9|
GR|Grèce|Greece|22.6|39.1|
GT|Guatemala|Guatemala|-90.4|15.7|
GN|Guinée|Guinea|-10.9|10.4|guinee conakry
GQ|Guinée équatoriale|Equatorial Guinea|10.3|1.7|
GW|Guinée-Bissau|Guinea-Bissau|-15|12|
GY|Guyana|Guyana|-58.9|4.8|
HT|Haïti|Haiti|-72.7|18.9|
HN|Honduras|Honduras|-86.6|14.8|
HU|Hongrie|Hungary|19.4|47.2|
IN|Inde|India|79.6|22.9|
ID|Indonésie|Indonesia|117.2|-2.2|
IQ|Irak|Iraq|43.7|33|
IR|Iran|Iran|54.3|32.6|
IE|Irlande|Ireland|-8.1|53.2|
IS|Islande|Iceland|-18.6|65|
IL|Israël|Israel|35|31.5|
IT|Italie|Italy|12.1|42.8|
JM|Jamaïque|Jamaica|-77.3|18.2|
JP|Japon|Japan|138|37.6|
JO|Jordanie|Jordan|36.8|31.2|
KZ|Kazakhstan|Kazakhstan|67.3|48.2|
KE|Kenya|Kenya|37.8|0.6|
KG|Kirghizistan|Kyrgyzstan|74.5|41.5|
XK|Kosovo|Kosovo|20.9|42.6|
KW|Koweït|Kuwait|47.6|29.3|
LA|Laos|Laos|103.7|18.5|
LS|Lesotho|Lesotho|28.2|-29.6|
LV|Lettonie|Latvia|24.9|56.9|
LB|Liban|Lebanon|35.9|33.9|
LR|Liberia|Liberia|-9.3|6.5|
LY|Libye|Libya|18|27|
LI|Liechtenstein|Liechtenstein|9.55|47.15|
LT|Lituanie|Lithuania|23.9|55.3|
LU|Luxembourg|Luxembourg|6.1|49.8|
MK|Macédoine du Nord|North Macedonia|21.7|41.6|macedoine;macedonia
MG|Madagascar|Madagascar|46.7|-19.4|
MY|Malaisie|Malaysia|102.2|4|
MW|Malawi|Malawi|34.3|-13.2|
MV|Maldives|Maldives|73.5|3.7|
ML|Mali|Mali|-3.5|17.3|
MT|Malte|Malta|14.4|35.9|
MA|Maroc|Morocco|-6.3|31.9|
MU|Maurice|Mauritius|57.6|-20.3|ile maurice
MR|Mauritanie|Mauritania|-10.3|20.3|
MX|Mexique|Mexico|-102.5|23.9|
MD|Moldavie|Moldova|28.5|47.2|
MC|Monaco|Monaco|7.42|43.74|
MN|Mongolie|Mongolia|103.1|46.8|
ME|Monténégro|Montenegro|19.3|42.8|
MZ|Mozambique|Mozambique|35.5|-17.3|
NA|Namibie|Namibia|17.2|-22.1|
NP|Népal|Nepal|84|28.3|
NI|Nicaragua|Nicaragua|-85|12.8|
NE|Niger|Niger|9.4|17.4|
NG|Nigeria|Nigeria|8.1|9.6|
NO|Norvège|Norway|15.3|68.8|
NZ|Nouvelle-Zélande|New Zealand|171.5|-41.8|
OM|Oman|Oman|56.1|20.6|
UG|Ouganda|Uganda|32.4|1.3|
UZ|Ouzbékistan|Uzbekistan|63.1|41.8|
PK|Pakistan|Pakistan|69.3|29.9|
PS|Palestine|Palestine|35.2|31.9|territoires palestiniens;gaza;cisjordanie;west bank
PA|Panama|Panama|-80.1|8.5|
PG|Papouasie-Nouvelle-Guinée|Papua New Guinea|145.2|-6.5|
PY|Paraguay|Paraguay|-58.4|-23.2|
NL|Pays-Bas|Netherlands|5.3|52.1|hollande;holland
PE|Pérou|Peru|-74.4|-9.2|
PH|Philippines|Philippines|122.9|11.8|
PL|Pologne|Poland|19.4|52.1|
PT|Portugal|Portugal|-8.5|39.6|
QA|Qatar|Qatar|51.2|25.3|
DO|République dominicaine|Dominican Republic|-70.5|18.9|
CZ|République tchèque|Czech Republic|15.3|49.7|tchequie;czechia
RO|Roumanie|Romania|25|45.9|
GB|Royaume-Uni|United Kingdom|-2.9|54.1|uk;grande bretagne;great britain;angleterre;england
RU|Russie|Russia|96.7|61.9|federation de russie;russian federation
RW|Rwanda|Rwanda|29.9|-2|
SV|Salvador|El Salvador|-88.9|13.7|
ST|Sao Tomé-et-Principe|Sao Tome and Principe|6.7|0.4|
SN|Sénégal|Senegal|-14.5|14.4|
RS|Serbie|Serbia|20.8|44.2|
SC|Seychelles|Seychelles|55.5|-4.7|
SL|Sierra Leone|Sierra Leone|-11.8|8.6|
SG|Singapour|Singapore|103.8|1.35|
SK|Slovaquie|Slovakia|19.5|48.7|
SI|Slovénie|Slovenia|14.8|46.1|
SO|Somalie|Somalia|45.9|4.8|
SD|Soudan|Sudan|29.9|16|
SS|Soudan du Sud|South Sudan|30.2|7.3|sud soudan
LK|Sri Lanka|Sri Lanka|80.7|7.6|
SE|Suède|Sweden|16.7|62.8|
CH|Suisse|Switzerland|8.2|46.8|
SR|Suriname|Suriname|-55.9|4.1|
SY|Syrie|Syria|38.5|35|
TJ|Tadjikistan|Tajikistan|71|38.5|
TW|Taïwan|Taiwan|121|23.8|
TZ|Tanzanie|Tanzania|34.8|-6.3|
TD|Tchad|Chad|18.6|15.4|
TH|Thaïlande|Thailand|101|15.1|
TL|Timor oriental|East Timor|125.8|-8.8|timor leste
TG|Togo|Togo|1|8.5|
TT|Trinité-et-Tobago|Trinidad and Tobago|-61.3|10.5|
TN|Tunisie|Tunisia|9.6|34.1|
TM|Turkménistan|Turkmenistan|59.4|39.1|
TR|Turquie|Turkey|35.2|39.1|turkiye
UA|Ukraine|Ukraine|31.4|49|
UY|Uruguay|Uruguay|-56|-32.8|
VE|Venezuela|Venezuela|-66.2|7.1|
VN|Viêt Nam|Vietnam|106.3|16.6|viet nam
YE|Yémen|Yemen|47.6|15.9|
ZM|Zambie|Zambia|27.8|-13.5|
ZW|Zimbabwe|Zimbabwe|29.9|-19|
`;

// « Côte d'Ivoire » → « cote d ivoire » : minuscules, sans accents, sans ponctuation.
export function simplifier(texte) {
  return String(texte ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const PAR_NOM = new Map();   // écriture simplifiée → fiche du pays
const PAR_CODE = new Map();  // code ISO à deux lettres → fiche du pays

for (const ligne of TABLE.trim().split('\n')) {
  const [code, fr, en, lon, lat, autres] = ligne.split('|');
  const fiche = { code, nom: fr, lon: Number(lon), lat: Number(lat) };
  PAR_CODE.set(code, fiche);
  for (const ecriture of [fr, en, ...(autres ? autres.split(';') : [])]) PAR_NOM.set(simplifier(ecriture), fiche);
}

// Rend { code, nom, lon, lat } ou null si le pays n'est pas reconnu.
// Accepte « Mali », « mali », « ML » et « Mali - Gao » ou « Gao, Mali » (on essaie chaque morceau).
export function trouverPays(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return null;
  if (/^[A-Za-z]{2}$/.test(brut) && PAR_CODE.has(brut.toUpperCase())) return PAR_CODE.get(brut.toUpperCase());
  const entier = PAR_NOM.get(simplifier(brut));
  if (entier) return entier;
  for (const morceau of brut.split(/[,;/|]| - | – /)) {
    const fiche = PAR_NOM.get(simplifier(morceau));
    if (fiche) return fiche;
  }
  return null;
}
