const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Config = imports.misc.config;

const Gettext = imports.gettext.domain("gnome-shell-portfolio-manager");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const CURRENCIES = [
    'AED', // United Arab Emirates Dirham
    'AFA', // Afganistan Afghani
    'ALL', // Albanian Lek
    'ANG', // Netherlands Antilles Guilder
    'ARS', // Argentinian Peso
    'ATS', // Austrian Schilling
    'AUD', // Australian Dollar
    'AWG', // Aruban Florin
    'BBD', // Barbados Dollar
    'BDT', // Bangladesh Taka
    'BEF', // Belgian Franc
    'BGN', // Bulgarian Lev
    'BHD', // Bahraini Dinar
    'BMD', // Bermuda Dollar
    'BND', // Brunei Dollar
    'BOB', // Bolivian Boliviano
    'BRL', // Brazilian Real
    'BTN', // Bhutan Ngultrum
    'BWP', // Botswana Pula
    'BZD', // Belize Dollar
    'CAD', // Canadian Dollar
    'CHF', // Swiss Franc
    'CLP', // Chilean Peso
    'CNY', // Renmimbi Yuan
    'COP', // Colombian Peso
    'CRC', // Costa Rican Colon
    'CUP', // Cuban Peso
    'CVE', // Cape Verde Escudo
    'CYP', // Cypriot Pound
    'CZK', // Czech Koruna
    'DEM', // German Mark
    'DJF', // Djibouti Franc
    'DKK', // Danish Krone
    'DOP', // Dominican Peso
    'DZD', // Algerian Dinar
    'EEK', // Estonian Kroon
    'EGP', // Egyptian Pound
    'ESP', // Spanish Peseta
    'ETB', // Ethiopian Birr
    'EUR', // Euro
    'FIM', // Finnish Markka
    'FJD', // Fiji Dollar
    'FRF', // French Franc
    'GBP', // British Pound
    'GHC', // Ghanaian Cedi
    'GIP', // Gibraltar Pound
    'GMD', // Gambia Dalasi
    'GNF', // Guinea Franc
    'GRD', // Greek Drachma
    'GTQ', // Guatemala Quetzal
    'GYD', // Guyana Dollar
    'HKD', // Hong Kong Dollar
    'HNL', // Honduras Lempira
    'HRK', // Croatian Kuna
    'HTG', // Haitian Gourde
    'HUF', // Hungarian Forint
    'IDR', // Indonesian Rupiah
    'IEP', // Irish Punt
    'ILS', // Israeli Shekel
    'INR', // Indian Rupee
    'ISK', // Iceland Krona
    'ITL', // Italian Lira
    'JMD', // Jamaican Dollar
    'JOD', // Jordanian Dinar
    'JPY', // Japanese Yen
    'KES', // Kenyan Shilling
    'KHR', // Cambodian Riel
    'KMF', // Comoros Franc
    'KRW', // South Korean Won
    'KWD', // Kuwaiti Dinar
    'KYD', // Cayman Islands Dollar
    'LAK', // Laos Kip
    'LBP', // Lebanese Pound
    'LKR', // Sri Lanka Rupee
    'LSL', // Lesotho Loti
    'LTL', // Lithuanian Litas
    'LVL', // Latvian Lats
    'MAD', // Moroccan Dirham
    'MGF', // Malagasy Franc
    'MMK', // Myanmar Kyat
    'MNT', // Mongolian Tugrik
    'MRO', // Mauritania Ouguiya
    'MTL', // Maltese Pound
    'MUR', // Mauritius Rupee
    'MVR', // Maldives Rufiyan
    'MWK', // Malawi Kwacha
    'MXN', // Mexican Peso
    'MYR', // Malaysian Ringgit
    'MZM', // Mozambique Metical
    'NAD', // Namibian Dollar
    'NGN', // Nigerian Naira
    'NIO', // Nicaraguan Cordoba
    'NLG', // Dutch Guilder
    'NOK', // Norwegian Krone
    'NPR', // Nepal Rupee
    'NZD', // New Zealand Dollar
    'OMR', // Oman Rial
    'PEN', // Peruvian Sol
    'PGK', // Papua New Guinea Kina
    'PHP', // Philippines Peso
    'PKR', // Pakistani Rupee
    'PLN', // Polish Zloty
    'PTE', // Portuguese Escudo
    'QAR', // Qatari Rial
    'ROL', // Romanian Leu
    'RUB', // Russian Ruble
    'SAR', // Saudi Arabian Riyal
    'SBD', // Salomon Islands Dollar
    'SCR', // Seychelles Rupee
    'SDD', // Sudanese Dinar
    'SEK', // Swedish Krona
    'SGD', // Singapore Dollar
    'SHP', // St. Helena Pound
    'SIT', // Slovenian Tolar
    'SKK', // Slovak Koruna
    'SLL', // Sierra Leone Leone
    'SRG', // Surinam Guilder
    'STD', // Sao Tome & Principe Dobra
    'SVC', // El Salvador Colon
    'SYP', // Syria Pound
    'SZL', // Swaziland Lilangeni
    'THB', // Thai Baht
    'TND', // Tunisian Dinar
    'TOP', // Tonga Isl Pa’anga
    'TRL', // Turkish Lira
    'TTD', // Trinidad Dollar
    'TWD', // Taiwan New Dollar
    'TZS', // Tanzanian Shilling
    'UAH', // Ukraine Hryvnia
    'UGX', // Ugandan Shilling
    'USD', // US Dollar
    'VEB', // Venezuelan Bolivar
    'VND', // Vietnam Dong
    'VUV', // Vanuatu Vatu
    'WST', // Western Samoa Tala
    'XAF', // CFA Franc(BEAC)
    'XCD', // East Caribbean Dollar
    'XOF', // CFA Franc (BCEAO)
    'XPF', // CFP Franc
    'ZAR', // South African Rand
    'ZMK', // Zambia Kwacha
    'ZWD', // Zimbabwean Dollar
];

const PortfolioManagerPrefsWidget = new GObject.Class({
    Name: 'PortfolioManager.Prefs.Widget',
    GTypeName: 'PortfolioManagerPrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
        this.parent(params);
        this.row_spacing = 10;
        this._settings = Convenience.getSettings();

        this.margin = 24;
        this.spacing = 30;
        let msg_label = new Gtk.Label({
            label: _('Flash on change'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        let msg_input = new Gtk.Switch({
            halign: Gtk.Align.END
        });
        msg_input.set_active(this._settings.get_boolean('enable-flash'));
        msg_input.connect( 'notify::active', (self) => {
            this._settings.set_boolean('enable-flash', self.get_active());
        });
        this.attach(msg_label, 0, 1, 1, 1);
        this.attach(msg_input, 1, 1, 1, 1);

        this.margin = 24;
        this.spacing = 30;
        msg_label = new Gtk.Label({
            label: _('Portfolio currency'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        msg_input = new Gtk.ComboBoxText({
            has_entry: true,
            halign: Gtk.Align.END
        });
        for (var i = 0; i < CURRENCIES.length; i++) {
            msg_input.append_text(CURRENCIES[i]);
        }
        msg_input.get_child().set_text(this._settings.get_string('portfolio-currency'));
        msg_input.get_child().connect( 'notify::text', (self) => {
            this._settings.set_string('portfolio-currency', self.get_text());
        });
        this.attach(msg_label, 0, 2, 1, 1);
        this.attach(msg_input, 1, 2, 1, 1);

        this.margin = 24;
        this.spacing = 30;
        msg_label = new Gtk.Label({
            label: _('Update rate (seconds)'),
            hexpand: true,
            halign: Gtk.Align.START
        });
        msg_input = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 3600,
                step_increment: 5
            }),
            numeric: true,
            halign: Gtk.Align.END
        });
        msg_input.set_value(this._settings.get_int('update-rate'));
        msg_input.connect( 'notify::value', (self) => {
            this._settings.set_int('update-rate', self.get_value());
        });
        this.attach(msg_label, 0, 3, 1, 1);
        this.attach(msg_input, 1, 3, 1, 1);
    }
});

function init()
{
    Convenience.initTranslations("gnome-shell-portfolio-manager");
}

function buildPrefsWidget()
{
    let widget = new PortfolioManagerPrefsWidget();
    widget.show_all();

    return widget;
}
