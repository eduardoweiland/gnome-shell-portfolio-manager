const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const PanelMenu = imports.ui.panelMenu;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;

const CONFIG_DIR = GLib.build_pathv( '/', [
    GLib.get_user_data_dir(),
    'gnome-shell-portfolio-manager'
]);
const CONFIG_FILE = GLib.build_filenamev([
    CONFIG_DIR,
    'config.json'
]);

var config = {
    stocks: {
    }
};

/**
 * I need this because gnome-shell seems to ignore the options parameter of
 * toLocaleString() for numbers.
 */
function toLocaleFixed(n, digits) {
    if(n === null) {
        return '---';
    }
    //return parseFloat(n.toFixed(digits)).toLocaleString();
    return n.toFixed(digits);
}

const PortfolioMenuButton = new Lang.Class({
    Name: 'PortfolioMenuButton', Extends: PanelMenu.Button,

    _init: function ()
    {
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
            reactive: false
        });
        this.menu.addMenuItem(this.summary);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.stocklist = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });
        this.menu.addMenuItem(this.stocklist);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.stockInput = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });
        this.menu.addMenuItem(this.stockInput);

//------------------------------------------------------------------------------

        this.stockEntries = {
            count_entry: null,
            name_entry: null,
            buyval_entry: null
        };

        let se = this.stockEntries;
        let bb = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'popup-inactive-menu-item'
        });

        let item = null;
        se.count_entry = new St.Entry({
            hint_text: 'count',
            x_expand: true
        });
        se.count_entry.clutter_text.connect('key-press-event', this.onKeyPress.bind(this));
        bb.add_actor(se.count_entry);
        se.name_entry = new St.Entry({
            hint_text: 'name',
            x_expand: true
        });
        se.name_entry.clutter_text.connect('key-press-event', this.onKeyPress.bind(this));
        bb.add_actor(se.name_entry);
        se.buyval_entry = new St.Entry({
            hint_text: 'value',
            x_expand: true
        });
        se.buyval_entry.clutter_text.connect('key-press-event', this.onKeyPress.bind(this));
        bb.add_actor(se.buyval_entry);

        this.stockInput.actor.add_actor(bb);

//------------------------------------------------------------------------------

        Main.panel.menuManager.addMenu(this.menu);
        this.menu._arrowAlignment=0.5;

        this.portfolioData = {
            value_current: null,
            value_bought: null,
            value_yesterday: null,
            diff_bought: null,
            diff_yesterday: null,
            diff_bought_rel: null,
            diff_yesterday_rel: null
        };

        this.stocksData = {};
        for (var stock in config.stocks) {
            this.stocksData[stock] = {
                lastTradePrice: null,
                previousClose: null,
                name: stock,

                diff_yesterday: null,
                diff_yesterday_rel: null,
                value_current_sum: null,
                diff_bought_sum: null,
                diff_bought_sum_rel: null
            };
        }

        this.rebuildSummary();
        this.rebuildPanelMenu();
        this.rebuildStocklist();
        this.fetchStocks();

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120000, () => {
            this.fetchStocks();
            return true;
        }, null);
    },

    rebuildSummary: function() {
        this.portfolioLabels = {
            value_current: new St.Label(),
            value_bought: new St.Label(),
            diff_bought: new St.Label(),
            diff_yesterday: new St.Label(),
            diff_bought_rel: new St.Label(),
            diff_yesterday_rel: new St.Label()
        };

        let bb = new St.BoxLayout({
            vertical: false,
            style_class: 'popup-inactive-menu-item'
        });

        let b1 = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        b1.add_actor(new St.Label({ text: _('Depotwert:') }));
        b1.add_actor(new St.Label({ text: _('Kaufwert:') }));
        bb.add_actor(b1);

        let b2 = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        b2.add_actor(this.portfolioLabels.value_current);
        b2.add_actor(this.portfolioLabels.value_bought);
        bb.add_actor(b2);

        let b3 = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        b3.add_actor(new St.Label({ text: _('Differenz seit Kauf:') }));
        b3.add_actor(new St.Label({ text: _('Differenz zum Vortag:') }));
        bb.add_actor(b3);

        let b4 = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        b4.add_actor(this.portfolioLabels.diff_bought);
        b4.add_actor(this.portfolioLabels.diff_yesterday);
        bb.add_actor(b4);

        let b5 = new St.BoxLayout({
            vertical: true,
            style_class: 'portfolio-label'
        });
        b5.add_actor(this.portfolioLabels.diff_bought_rel);
        b5.add_actor(this.portfolioLabels.diff_yesterday_rel);
        bb.add_actor(b5);

        this.summary.actor.add_actor(bb);
    },

    rebuildPanelMenu: function(new_value, old_value) {
        let panel_icon = 'view-refresh-symbolic';
        let panel_text = '...';
        let bgcolor = null;
        if(new_value !== undefined) {
            panel_text = toLocaleFixed(new_value, 2) + '%';
            if(old_value === null) {
                panel_icon = 'pan-end-symbolic';
            } else if(new_value > old_value) {
                bgcolor = {red: 0, green: 255, blue: 50, alpha: 150};
                panel_icon = 'pan-up-symbolic';
            } else if (new_value < old_value) {
                bgcolor = {red: 255, green: 0, blue: 50, alpha: 150};
                panel_icon = 'pan-down-symbolic';
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

        if(bgcolor !== null) {
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
        this.stocklist.actor.remove_all_children();

        let list = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'portfolio-label'
        });

        this.stocksLabels = {};
        for (var stock in config.stocks) {
            if(this.stocksData[stock] === undefined) {
                this.stocksData[stock] = {
                    lastTradePrice: null,
                    previousClose: null,
                    name: stock,

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
            let bb = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                style_class: 'popup-inactive-menu-item'
            });

            let item = null;
            //item = Main.panel.statusArea.aggregateMenu._system._createActionButton('window-close-symbolic', _('Remove'));
            //item.set_x_align(Clutter.ActorAlign.CENTER);
            //item.set_y_align(Clutter.ActorAlign.CENTER);
            item = new St.Button({
                reactive: true,
                can_focus: true,
                track_hover: true,
                accessible_name: 'Remove',
                style_class: 'portfolio-label'
            });
            item.child = new St.Icon({
                icon_size: 15,
                icon_name: 'window-close-symbolic'
            });
            item.connect('clicked', this.removeStock.bind(this, stock));
            bb.add_actor(item);
            item = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'portfolio-label'
            });
            item.add_actor(new St.Label({ text: _(config.stocks[stock].count+"") }));
            bb.add_actor(item);
            item = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'portfolio-stock-label'
            });
            item.add_actor(sl.name);
            bb.add_actor(item);
            item = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.END,
                style_class: 'portfolio-label'
            });
            item.add_actor(sl.value_current);
            item.add_actor(sl.diff_yesterday);
            item.add_actor(sl.diff_yesterday_rel);
            bb.add_actor(item);
            item = new St.BoxLayout({
                vertical: true,
                x_align: Clutter.ActorAlign.END,
                style_class: 'portfolio-label'
            });
            item.add_actor(sl.value_current_sum);
            item.add_actor(sl.diff_bought_sum);
            item.add_actor(sl.diff_bought_sum_rel);
            bb.add_actor(item);
            list.add_actor(bb);

            this.redrawStock(stock);
        }

        this.stocklist.actor.add_actor(list);
        this.recalcPortfolio();
    },

    fetchStocks: function () {
        //for (var stock in config.stocks) {
        //    this.recalcStock(stock, [String(50 + Math.random()), String(50), "name"]);
        //}
        //this.recalcPortfolio();
        if (this.httpSession) {
            this.httpSession.abort();
        }
        this.httpSession = new Soup.Session();

        let param_stocks = '';
        for (var stock in config.stocks) {
            param_stocks += stock + ',';
        }
        param_stocks = param_stocks.substring(0, param_stocks.length);
        let url = 'http://download.finance.yahoo.com/d/quotes.csv';
        let params = {s: param_stocks, f: "l1pn"};
        let message = Soup.form_request_new_from_hash('GET', url, params);
        this.httpSession.queue_message(message, (httpSession, message) => {
            try {
                let split_body = message.response_body.data.split('\n');
                let i = 0;
                for (var stock in config.stocks) {
                    this.recalcStock(stock, split_body[i].split(','));
                    i += 1;
                }
                this.recalcPortfolio();
            } catch (e) {
            }
        });
    },

    recalcStock: function(stock, data) {
        let sd = this.stocksData[stock];
        let sc = config.stocks[stock];
        sd.lastTradePrice = Number(data[0]);
        sd.previousClose = Number(data[1]);
        sd.name = String(data[2]);
        sd.diff_yesterday = sd.lastTradePrice-sd.previousClose;
        sd.diff_yesterday_rel = sd.diff_yesterday/sd.previousClose*100;
        sd.value_current_sum = sd.lastTradePrice*sc.count;
        sd.diff_bought_sum = sd.value_current_sum-sc.count*sc.buyval;
        sd.diff_bought_sum_rel = sd.diff_bought_sum/sc.count/sc.buyval*100;

        this.redrawStock(stock);
    },

    redrawStock: function(stock) {
        let sd = this.stocksData[stock];
        let sl = this.stocksLabels[stock];
        sl.name.set_text(sd.name);
        sl.value_current.set_text(toLocaleFixed(sd.lastTradePrice, 2));
        sl.diff_yesterday.set_text(toLocaleFixed(sd.diff_yesterday, 2));
        sl.diff_yesterday_rel.set_text(toLocaleFixed(sd.diff_yesterday_rel, 2) + '%');
        sl.value_current_sum.set_text(toLocaleFixed(sd.value_current_sum, 2));
        sl.diff_bought_sum.set_text(toLocaleFixed(sd.diff_bought_sum, 2));
        sl.diff_bought_sum_rel.set_text(toLocaleFixed(sd.diff_bought_sum_rel, 2) + '%');
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
            it_cfg = config.stocks[stock];
            it_cur = this.stocksData[stock];
            p.value_current += it_cfg.count * it_cur.lastTradePrice;
            p.value_bought += it_cfg.count * it_cfg.buyval;
            p.value_yesterday += it_cur.previousClose * it_cfg.count;
            p.diff_yesterday += it_cur.diff_yesterday * it_cfg.count;
        }
        p.diff_bought = p.value_current - p.value_bought;
        p.diff_bought_rel = p.diff_bought/p.value_bought*100.0;
        p.diff_yesterday_rel = p.diff_yesterday/p.value_yesterday*100.0;


        let pl = this.portfolioLabels;
        pl.value_current.set_text(toLocaleFixed(p.value_current, 2));
        pl.value_bought.set_text(toLocaleFixed(p.value_bought, 2));
        pl.diff_bought.set_text(toLocaleFixed(p.diff_bought, 2));
        pl.diff_bought_rel.set_text(toLocaleFixed(p.diff_bought_rel, 2) + '%');
        pl.diff_yesterday.set_text(toLocaleFixed(p.diff_yesterday, 2));
        pl.diff_yesterday_rel.set_text(toLocaleFixed(p.diff_yesterday_rel, 2) + '%');

        this.rebuildPanelMenu(p.diff_bought_rel, diff_bought_rel_old);
    },

    addStock: function(stock, count, buyval) {
        config.stocks[stock] = {
            count: count,
            buyval: buyval
        };
        this.saveConfig();
        this.rebuildStocklist();
        this.fetchStocks();
    },

    removeStock: function(stock) {
        delete config.stocks[stock];
        this.saveConfig();
        this.rebuildStocklist();
    },

    onKeyPress: function(origin, event) {
        let symbol = event.get_key_symbol();
        if ((symbol == Clutter.Return) || (symbol == Clutter.KP_Enter)) {
            let se = this.stockEntries;
            let count = se.count_entry.clutter_text.get_text();
            let name = se.name_entry.clutter_text.get_text();
            let buyval = se.buyval_entry.clutter_text.get_text();
            if (count === '' || name === '' || buyval === '') {
                return;
            }
            this.addStock(name, Number(count), Number(buyval));
            se.count_entry.clutter_text.set_text('');
            se.name_entry.clutter_text.set_text('');
            se.buyval_entry.clutter_text.set_text('');
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
    }
});

let portfolioMenu;

function init()
{
}

function enable()
{
    portfolioMenu = new PortfolioMenuButton();
    Main.panel.addToStatusArea('portfolio-menu', portfolioMenu);
}

function disable()
{
    portfolioMenu.destroy();
}
