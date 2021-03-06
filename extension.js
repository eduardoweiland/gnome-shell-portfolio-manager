const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Soup = imports.gi.Soup;

const Gettext = imports.gettext.domain("gnome-shell-portfolio-manager");
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const CONFIG_DIR = GLib.build_pathv( '/', [
    GLib.get_user_data_dir(),
    'gnome-shell-portfolio-manager'
]);
const CONFIG_FILE = GLib.build_filenamev([
    CONFIG_DIR,
    'config.json'
]);

var preferences = {
};

var config = {
    stocks: {
    }
};

function setTextFormatted(actor, n, digits, colored, unit) {
    if(n === null) {
        actor.set_text('---');
        return;
    }

    // TODO fidure out how to use toLocaleString with fixed digits
    let text = n.toFixed(digits);

    if (colored) {
        if (n < 0.0) {
            actor.set_style_class_name('negative-change');
        } else {
            text = '+' + text;
            actor.set_style_class_name('positive-change');
        }
    }

    if (unit) {
        text += unit;
    }

    actor.set_text(text);
}

const PortfolioMenuButton = new Lang.Class({
    Name: 'PortfolioMenuButton', Extends: PanelMenu.Button,

    _init: function ()
    {
        this._settings = Convenience.getSettings();
        this._settings.connect('changed', () => {
            this.stop();
            this.loadPreferences();
            this.start();
            this.fetchStocks();
            this.rebuildStockInput();
            this.rebuildGrid();
        });

        this.loadPreferences();
        this.loadConfig();

        // create the panel bar button
        this.parent(0.0, "Portfolio Manager", false);

        this.panelButtonBox = new St.BoxLayout();
        this.actor.add_actor(this.panelButtonBox);

        let dummyBox = new St.BoxLayout();
        this.actor.reparent(dummyBox);
        dummyBox.remove_actor(this.actor);
        dummyBox.destroy();

        let children = Main.panel._centerBox.get_children();
        Main.panel._centerBox.insert_child_at_index(this.actor, children.length);

        // add popup menu to panel button
        this.summary = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        this.menu.addMenuItem(this.summary);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.stockInput = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        this.menu.addMenuItem(this.stockInput);

        Main.panel.menuManager.addMenu(this.menu);
        this.menu._arrowAlignment=0.5;

        this.stocksData = {};

        this.rebuildGrid();
        this.rebuildStockInput();
        this.rebuildPanelMenu();
        this.fetchStocks();
        this.start();
    },

    start: function () {
        let rate_ms = preferences.update_rate*1000;
        this.fetchItv = GLib.timeout_add(GLib.PRIORITY_DEFAULT, rate_ms, () => {
            this.fetchStocks();
            return true;
        }, null);
    },

    stop: function() {
        GLib.source_remove(this.fetchItv);
    },

    rebuildGrid: function() {
        this.portfolioData = {
            value_current: null,
            value_bought: null,
            value_yesterday: null,
            diff_bought: null,
            diff_yesterday: null,
            diff_bought_rel: null,
            diff_yesterday_rel: null
        };

        for (var stock in config.stocks) {
            if(this.stocksData[stock] !== undefined) {
                continue;
            }

            this.stocksData[stock] = {
                lastTradePrice: null,
                previousClose: null,
                name: stock,
                currency: "",
                history: [],
                historyCurrency: [],

                diff_yesterday: null,
                diff_yesterday_rel: null,
                value_current_sum: null,
                diff_bought_sum: null,
                diff_bought_sum_rel: null
            };
        }

        this.rebuildSummary();
        this.rebuildStocklist();
    },

    rebuildSummary: function() {
        this.summary.actor.destroy_all_children();
        this.grid = new St.Widget({
            style_class: 'portfolio-label',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            layout_manager: new Clutter.GridLayout()
        });
        let summaryBox = new St.BoxLayout();
        summaryBox.add_actor(this.grid);
        let scrollView = new St.ScrollView();
        scrollView.vscrollbar_policy = Gtk.PolicyType.AUTOMATIC;
        scrollView.hscrollbar_policy = Gtk.PolicyType.NEVER;
        scrollView.add_actor(summaryBox);
        this.summary.actor.add_child(scrollView);

        this.portfolioLabels = {
            value_current: new St.Label(),
            diff_bought: new St.Label(),
            diff_yesterday: new St.Label(),
            diff_bought_rel: new St.Label(),
            diff_yesterday_rel: new St.Label()
        };
        let layout = this.grid.layout_manager;
        let item = null;

        item = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-stock-label'
        });
        item.add_actor(new St.Label({ text: _('5-Day Chart') }));
        layout.attach(item, 1, 0, 2, 1);

        item = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        item.add_actor(new St.Label({ text: _('Today') }));
        layout.attach(item, 3, 0, 1, 1);

        item = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        item.add_actor(new St.Label({ text: _('Total') }));
        layout.attach(item, 4, 0, 1, 1);

        this.chart = new St.DrawingArea();
        layout.attach(this.chart, 1, 1, 2, 1);
        this.chart.connect('repaint', this.redrawChart.bind(this));

        item = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        item.add_actor(new St.Label());
        item.add_actor(this.portfolioLabels.diff_yesterday);
        item.add_actor(this.portfolioLabels.diff_yesterday_rel);
        layout.attach(item, 3, 1, 1, 1);

        item = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        item.add_actor(this.portfolioLabels.value_current);
        item.add_actor(this.portfolioLabels.diff_bought);
        item.add_actor(this.portfolioLabels.diff_bought_rel);
        layout.attach(item, 4, 1, 1, 1);

        item = new St.Widget({
            style_class: 'popup-separator-menu-item',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        layout.attach(item, 0, 2, 5, 1);
    },

    redrawChart: function(area) {
        let cr = area.get_context();
        let [width, height] = area.get_surface_size();

        let endTime = Date.now();
        let startTime = endTime - (1000*3600*24*5);
        let incTime = (endTime-startTime)/width;
        let openVal = this.getPortfolioValue(startTime/1000);
        let portfolioValues = [];
        let pfMin = Number.MAX_VALUE;
        let pfMax = Number.MIN_VALUE;
        for(let i = 0; i < width+1; i++) {
            let itTime = startTime+i*incTime;
            let itChange = this.getPortfolioValue(itTime/1000)/openVal;
            if (itChange < pfMin) {
                pfMin = itChange;
            }
            if (itChange > pfMax) {
                pfMax = itChange;
            }
            portfolioValues.push(itChange);
        }

        let zeroline = height*(portfolioValues[0]-pfMax)/(pfMin-pfMax);
        cr.moveTo(0, zeroline);
        for(let i = 0; i < width+1; i++) {
            let v = portfolioValues[i];
            cr.lineTo(i,height*(v-pfMax)/(pfMin-pfMax));
        }
        cr.setOperator(Cairo.Operator.OVER);
        cr.setLineWidth(1);
        cr.setSourceRGBA(0,0,0,0.5);
        cr.strokePreserve();
        cr.setSourceRGBA(0.5,0.5,0.5,0.5);
        cr.lineTo(width, zeroline);
        cr.fill();

        cr.setOperator(Cairo.Operator.ATOP);
        cr.setSourceRGBA(0,0.6875,0.25,0.9);
        cr.rectangle(0, 0, width, zeroline);
        cr.fill();
        cr.setSourceRGBA(1,0.5,0.5,0.9);
        cr.rectangle(0, zeroline, width, height);
        cr.fill();

        cr.setOperator(Cairo.Operator.OVER);
        cr.setLineWidth(0.5);
        cr.setSourceRGB(0.5,0.5,0.5);
        cr.moveTo(0, zeroline);
        cr.lineTo(width, zeroline);
        cr.stroke();

        cr.$dispose();
    },

    rebuildPanelMenu: function(new_value, old_value) {
        let panel_icon = 'view-refresh-symbolic';
        let panel_text = '...';
        let bgcolor = null;
        if(new_value !== undefined) {
            panel_text = new_value.toFixed(2) + '%'; // TODO localization
            if(old_value === null) {
                panel_icon = 'pan-end-symbolic';
            } else if(new_value > old_value) {
                bgcolor = {red: 0, green: 255, blue: 50, alpha: 150};
                panel_icon = 'pan-up-symbolic';
            } else if (new_value < old_value) {
                bgcolor = {red: 255, green: 0, blue: 50, alpha: 150};
                panel_icon = 'pan-down-symbolic';
            } else {
                panel_icon = 'pan-end-symbolic';
            }
        }
        this.panelButtonBox.remove_all_children();
        let panelIcon = new St.Icon({
            icon_size: 15,
            icon_name: panel_icon
        });
        this.panelButtonBox.add_actor(panelIcon);

        this.panelLabel = new St.Label({
            text: panel_text,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.panelButtonBox.add_actor(this.panelLabel);

        if(preferences.enable_flash && bgcolor !== null) {
            Tweener.addTween( bgcolor, {
                alpha: 0,
                time: 0.5,
                transition: 'linear',
                onUpdate: () => {
                    let bgcolor_clutter = new Clutter.Color({
                        red: bgcolor.red,
                        green: bgcolor.green,
                        blue: bgcolor.blue,
                        alpha: bgcolor.alpha
                    });
                    this.actor.set_background_color(bgcolor_clutter);
                }
            });
        }
    },

    rebuildStocklist: function () {
        let layout = this.grid.layout_manager;
        let row = 3;
        this.stocksLabels = {};
        for (var stock in config.stocks) {
            if(this.stocksData[stock] === undefined) {
                this.stocksData[stock] = {
                    lastTradePrice: null,
                    previousClose: null,
                    name: stock,
                    currency: "",
                    history: [],
                    historyCurrency: [],

                    diff_yesterday: null,
                    diff_yesterday_rel: null,
                    value_current_sum: null,
                    diff_bought_sum: null,
                    diff_bought_sum_rel: null
                };
            }

            this.stocksLabels[stock] = {
                name: new St.Label(),
                value_current: new St.Label(),
                diff_yesterday: new St.Label(),
                diff_yesterday_rel: new St.Label(),
                value_current_sum: new St.Label(),
                diff_bought_sum: new St.Label(),
                diff_bought_sum_rel: new St.Label()
            };
            let sl = this.stocksLabels[stock];

            let item = null;
            let button = null;
            item = new St.Bin();
            button = Main.panel.statusArea.aggregateMenu._system._createActionButton('window-close-symbolic', 'Remove');
            button.connect('clicked', this.removeStock.bind(this, stock));
            button.set_style('padding: 8px; border: 0px');
            item.add_actor(button);
            layout.attach(item, 0, row, 1, 1);

            item = new St.BoxLayout({
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'portfolio-label'
            });
            let count = String(config.stocks[stock].count);
            item.add_actor(new St.Label({ text: count }));
            layout.attach(item, 1, row, 1, 1);

            item = new St.BoxLayout({x_align: Clutter.ActorAlign.START});
            let bin = new St.Bin();
            button = Main.panel.statusArea.aggregateMenu._system._createActionButton(String(sl.name), 'Open in Browser');
            button.connect('clicked', Gtk.show_uri.bind(this,
                null,
                'https://finance.yahoo.com/quote/' + stock,
                global.get_current_time()
            ));
            button.add_actor(sl.name);
            button.set_style('padding: 8px; border: 0px; border-radius: 5px');
            bin.add_actor(button);
            item.add_actor(bin);
            layout.attach(item, 2, row, 1, 1);

            item = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.END,
                style_class: 'portfolio-label'
            });
            item.add_actor(sl.value_current);
            item.add_actor(sl.diff_yesterday);
            item.add_actor(sl.diff_yesterday_rel);
            layout.attach(item, 3, row, 1, 1);

            item = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.END,
                style_class: 'portfolio-label'
            });
            item.add_actor(sl.value_current_sum);
            item.add_actor(sl.diff_bought_sum);
            item.add_actor(sl.diff_bought_sum_rel);
            layout.attach(item, 4, row, 1, 1);

            row += 1;

            this.redrawStock(stock);
        }

        this.recalcPortfolio();
    },

    rebuildStockInput: function() {
        this.stockEntries = {
            count_entry: null,
            name_entry: null,
            buyval_entry: null
        };

        let se = this.stockEntries;
        let bb = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'popup-inactive-menu-item'
        });

        se.count_entry = new St.Entry({
            hint_text: _('cnt.'),
            can_focus: true,
            width: 75
        });
        se.count_entry.set_style('margin-right: 10px');
        se.count_entry.clutter_text.connect('key-press-event',
                                            this.onKeyPress.bind(this));
        bb.add_actor(se.count_entry);
        se.name_entry = new St.Entry({
            hint_text: _('symbol'),
            can_focus: true,
            width: 200
        });
        se.name_entry.set_style('margin-right: 10px');
        se.name_entry.clutter_text.connect('key-press-event',
                                           this.onKeyPress.bind(this));
        bb.add_actor(se.name_entry);
        se.buyval_entry = new St.Entry({
            hint_text: _('price') + ' (' + preferences.currency + ')',
            can_focus: true,
            width: 125
        });
        se.buyval_entry.clutter_text.connect('key-press-event',
                                             this.onKeyPress.bind(this));
        bb.add_actor(se.buyval_entry);

        this.stockInput.actor.remove_all_children();
        this.stockInput.actor.add_actor(bb);
    },

    fetchStocks: function () {
        if (this.httpSession) {
            this.httpSession.abort();
        }
        this.httpSession = new Soup.Session();

        let refetch = false;
        let param_stocks = '';
        for (let stock in config.stocks) {
            param_stocks += stock + ',';
            let stock_currency = this.stocksData[stock].currency;
            param_stocks += preferences.currency + stock_currency + '=X,';
            if(stock_currency === "") {
                refetch = true;
            }
        }
        param_stocks = param_stocks.substring(0, param_stocks.length);
        let url = 'http://download.finance.yahoo.com/d/quotes.csv';
        let params = {s: param_stocks, f: "l1pnc4"};
        let message = Soup.form_request_new_from_hash('GET', url, params);
        this.httpSession.queue_message(message, (httpSession, message) => {
            try {
                let msg = message.response_body.data;
                msg = msg.replace(new RegExp("N/A", 'g'), "null");
                let split_body = msg.split('\n');
                let i = 0;
                for (let stock in config.stocks) {
                    let stock_rate = JSON.parse('[' + split_body[i] + ']');
                    let currency_rate = JSON.parse('[' + split_body[i+1] + ']');
                    this.recalcStock(stock, stock_rate, currency_rate);
                    i += 2;
                }

                if(true === refetch) {
                    this.fetchStocks();
                } else {
                    this.recalcPortfolio();
                }
            } catch (e) {
                log('Error fetching stocks: ' + e);
            }
        });

        if(true === refetch) {
            return;
        }

        for (let stock in config.stocks) {
            let urlPre = 'https://chartapi.finance.yahoo.com/instrument/1.0/';
            let urlPost = '/chartdata\;type\=quote\;range\=5d/csv';
            let url = urlPre + stock + urlPost;
            let message = Soup.form_request_new_from_hash('GET', url, {});
            this.httpSession.queue_message(
                message, this.parseChartData.bind(this, stock, false));

            let pc = preferences.currency;
            let sc = this.stocksData[stock].currency;
            url = urlPre + pc + sc + '\=X' + urlPost;
            message = Soup.form_request_new_from_hash('GET', url, {});
            this.httpSession.queue_message(
                message, this.parseChartData.bind(this, stock, true));
        }
    },

    parseChartData: function(stock, currency, httpSession, message) {
        try {
            let msg = message.response_body.data;
            let split_body = msg.split('\n');
            if(true === currency) {
                this.stocksData[stock].historyCurrency = [];
            } else {
                this.stocksData[stock].history = [];
            }
            for (var i = 0; i < split_body.length; i++) {
                it = split_body[i];
                if (it.indexOf(':') !== -1) {
                    continue;
                }
                let parsed_line = JSON.parse('[' + split_body[i] + ']');
                let new_item = {
                    timestamp: parsed_line[0],
                    close: parsed_line[1],
                    high: parsed_line[2],
                    low: parsed_line[3],
                    open: parsed_line[4],
                    volume: parsed_line[5]
                };
                if(true === currency) {
                    this.stocksData[stock].historyCurrency.push(new_item);
                } else {
                    this.stocksData[stock].history.push(new_item);
                }
            }
        } catch (e) {
            log('Error parsing ' + (currency ? 'currency ' : '') +
                'history of ' + stock + ': ' + e);
        }
        this.chart.queue_repaint();
    },

    getPortfolioValue: function(timestamp) {
        let portfolioValue = 0;
        for (let stock in config.stocks) {
            let itVal = this.getStockValue(stock, timestamp);
            portfolioValue += itVal * config.stocks[stock].count;
        }
        return portfolioValue;
    },

    getStockValue: function(stock, timestamp) {
        let sh = this.stocksData[stock].history;
        let shc = this.stocksData[stock].historyCurrency;
        let value;
        let i = 0;
        for (; i < sh.length; i++) {
            if(timestamp > sh[i].timestamp) {
                continue;
            }
            break;
        }
        i -= 1;

        if(sh.length !== 0) {
            if (i<0) {
                value = sh[0].open;
            } else {
                value = sh[i].close;
            }
        }

        let j = 0;
        for (; j < shc.length; j++) {
            if(timestamp > shc[j].timestamp) {
                continue;
            }
            break;
        }
        j -= 1;
        if(shc.length !== 0) {
            if (j<0) {
                value /= shc[0].open;
            } else {
                value /= shc[j].close;
            }
        }

        return value;
    },

    recalcStock: function(stock, data, currency_rate) {
        let sd = this.stocksData[stock];
        let sc = config.stocks[stock];
        sd.lastTradePrice = data[0];
        sd.lastTradePriceConverted = sd.lastTradePrice/currency_rate[0];
        sd.previousClose = data[1];
        sd.name = data[2];
        sd.currency = data[3];
        sd.diff_yesterday = sd.lastTradePrice-sd.previousClose;
        sd.diff_yesterday_rel = sd.diff_yesterday/sd.previousClose*100;
        sd.value_current_sum = sd.lastTradePriceConverted*sc.count;
        sd.diff_bought_sum = sd.value_current_sum-sc.count*sc.buyval;
        sd.diff_bought_sum_rel = sd.diff_bought_sum/sc.count/sc.buyval*100;

        this.redrawStock(stock);
    },

    redrawStock: function(stock) {
        let sd = this.stocksData[stock];
        let sl = this.stocksLabels[stock];
        sl.name.set_text(sd.name);
        setTextFormatted(sl.value_current, sd.lastTradePrice, 2, false, ' ' + sd.currency);
        setTextFormatted(sl.diff_yesterday, sd.diff_yesterday, 2, true, ' ' + sd.currency);
        setTextFormatted(sl.diff_yesterday_rel, sd.diff_yesterday_rel, 2, true, '%');
        setTextFormatted(sl.value_current_sum, sd.value_current_sum, 2, false, ' ' + preferences.currency);
        setTextFormatted(sl.diff_bought_sum, sd.diff_bought_sum, 2, true, ' ' + preferences.currency);
        setTextFormatted(sl.diff_bought_sum_rel, sd.diff_bought_sum_rel, 2, true, '%');
    },

    recalcPortfolio: function () {
        let diff_bought_rel_old = null;
        if(this.portfolioData) {
            diff_bought_rel_old = this.portfolioData.diff_bought_rel;
        }

        let p = this.portfolioData;
        p.value_current = 0;
        p.value_bought = 0;
        p.value_yesterday = 0;
        p.diff_yesterday = 0;
        for (var stock in config.stocks) {
            let it_cfg = config.stocks[stock];
            let it_cur = this.stocksData[stock];
            p.value_current += it_cfg.count * it_cur.lastTradePriceConverted;
            p.value_bought += it_cfg.count * it_cfg.buyval;
            p.value_yesterday += it_cur.previousClose * it_cfg.count;
            p.diff_yesterday += it_cur.diff_yesterday * it_cfg.count;
        }
        p.diff_bought = p.value_current - p.value_bought;
        p.diff_bought_rel = p.diff_bought/p.value_bought*100.0;
        p.diff_yesterday_rel = p.diff_yesterday/p.value_yesterday*100.0;


        let pl = this.portfolioLabels;
        setTextFormatted(pl.value_current, p.value_current, 2, false, ' ' + preferences.currency);
        setTextFormatted(pl.diff_bought, p.diff_bought, 2, true, ' ' + preferences.currency);
        setTextFormatted(pl.diff_bought_rel, p.diff_bought_rel, 2, true, '%');

        this.rebuildPanelMenu(p.diff_bought_rel, diff_bought_rel_old);
    },

    addStock: function(stock, count, buyval) {
        config.stocks[stock] = {
            count: count,
            buyval: buyval
        };
        this.saveConfig();
        this.rebuildGrid();
        this.fetchStocks();
    },

    removeStock: function(stock) {
        delete config.stocks[stock];
        this.saveConfig();
        this.rebuildGrid();
    },

    onKeyPress: function(origin, event) {
        let symbol = event.get_key_symbol();
        if ((symbol == Clutter.Return) || (symbol == Clutter.KP_Enter)) {
            let se = this.stockEntries;
            let count = se.count_entry.get_text();
            let name = se.name_entry.get_text();
            let buyval = se.buyval_entry.get_text();
            if (count === '' || name === '' || buyval === '') {
                return;
            }
            this.addStock(name, Number(count), Number(buyval));
            se.count_entry.set_text('');
            se.name_entry.set_text('');
            se.buyval_entry.set_text('');
        }
    },

    saveConfig: function() {
        GLib.mkdir_with_parents(CONFIG_DIR, 493);
        GLib.file_set_contents(CONFIG_FILE, JSON.stringify(config, null, "  "));
    },

    loadConfig: function() {
        try {
            let config_json = GLib.file_get_contents(CONFIG_FILE);
            if (config_json[0]) {
                config = JSON.parse(config_json[1]);
            }
        } catch (e) {
        }
    },

    loadPreferences: function () {
        let settings = this._settings;
        preferences.enable_flash = settings.get_boolean('enable-flash');
        preferences.currency = settings.get_string('portfolio-currency');
        preferences.update_rate = settings.get_int('update-rate');
    }
});

let portfolioMenu;

function init()
{
    Convenience.initTranslations("gnome-shell-portfolio-manager");
}

function enable()
{
    portfolioMenu = new PortfolioMenuButton();
    Main.panel.addToStatusArea('portfolio-menu', portfolioMenu);
}

function disable()
{
    portfolioMenu.stop();
    portfolioMenu.destroy();
}
