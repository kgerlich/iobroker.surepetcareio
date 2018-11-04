/**
 *
 * surepetcareio adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "surepetcareio",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js surepetcareio Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@surepetcareio.com>"
 *          ]
 *          "desc":         "surepetcareio adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42,
 *          "mySelect": "auto"
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.surepetcareio.0
const adapter = new utils.Adapter('surepetcareio');

const https = require('https');
const util = require('util')
const prettyMs = require('pretty-ms');

var numberOfLogins = 0;

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        adapter && adapter.setState && adapter.setState('connected', false, true);
        callback();
    } catch (e) {
        callback();
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

adapter.on('stateChange', function (id, state) {
    // only process if state was command.
    if (!id || !state || state.ack) {
        return;
    }
    var l = id.split('.');
    if ((l.length != 7) || l[l.length - 2] !== 'control') {
        adapter.info('what are you trying to set in ' + id + '???');
        return;
    }
    var lockmode = 0;
    if (state.val === true) {
        switch (l[l.length - 1])
        {
            case 'lockinside':
                lockmode = 1;
                break;
            case 'lockoutside':
                lockmode = 2;
                break;
            case 'lockboth':
                lockmode = 3;
                break;
            default:
                adapter.info('what are you trying to set in ' + id + '???');
                return;
        }
    }
    adapter.log.info(id + util.inspect(state, true, null, true /* enable colors */));
    let locking_state = l.splice(0,5).join('.') + '.locking';
    adapter.getState(locking_state, function(err, state) {
        if(state.val !== lockmode) {
            adapter.log.info('locking mode changing to ' + lockmode);
            var device = locking_state.split('.').splice(4,1).join('.');
            set_lockmode(device, lockmode);
        }
    });
});

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('config username: '    + adapter.config.username);
    adapter.log.info('config password: '    + adapter.config.password);

    // in this surepetcareio all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    do_login();
}

var privates = {};
var timerId = 0;
var privates_prev = {};

function timeout_callback()
{
    clearTimeout(timerId);
    get_control(function() {
        set_pets()
        timerId = setTimeout(timeout_callback, 10*1000);
    });
}

function build_options(path, method, token) {
    var options = {
        hostname: 'app.api.surehub.io',
        port: 443,
        path: path,
        method: method,
        headers: {
            "Host" : "app.api.surehub.io",
            "Accept" : "application/json, text/plain, */*",
            "Referer" : "https://surepetcare.io/",
            "Content-Type" : "application/json;charset=utf-8",
            "Origin" :  "https://surepetcare.io",
        }
    };

    if (token != undefined) {
        options.headers["Authorization"] = 'Bearer ' + token;
    }

    return options;
}

function do_request(tag, options, postData, callback) {
    var req = https.request(options, (res) => {
        adapter.log.debug(tag +' statusCode: ' + res.statusMessage + '(' +  res.statusCode + ')');
        adapter.log.debug(tag + ' headers:' + util.inspect(res.headers, false, null, true /* enable colors */));
    
        if (res.statusCode !== 200) {
            adapter.log.debug("status code not OK!");
            setTimeout(do_login, 5*1000);
        }

        var data = [];
        res.on('data', (chunk) => {
            data.push(chunk);
        });
        res.on('data', () => {
            try {
                var obj = JSON.parse(data.join(''));
                adapter.log.debug(util.inspect(obj, false, null, true /* enable colors */));
                callback(obj);
            } catch(err) {
                adapter.log.debug(err.message);
                adapter.log.debug('error in ' + data.toString());
                setTimeout(do_login, 5*1000);
            }
        });
    });

    req.on('error', (e) => {
        adapter.log.error(e);
        setTimeout(do_login, 5*1000);
    });

    req.write(postData);
    req.end();
}

function do_login() {
    adapter.setState('connected',false, true, function(err) {
        adapter.log.info('not connected...');
        privates = {};
        numberOfLogins++;
        console.info('trying to login (' + numberOfLogins + ')...');
        login(adapter.config.username, adapter.config.password, get_household);
    });    
}

function login(username, password, callback) {
  var postData = JSON.stringify( { 'email_address':username,'password':password, 'device_id':'1050547954'} );
  var options = build_options('/api/auth/login', 'POST');

  do_request('login', options, postData, function(obj) {
    if (obj == undefined || obj.data == undefined || !('token' in obj.data)) {
        adapter.log.info('no token in adapter, retrying login in 5 secs...');
        setTimeout(do_login, 5*1000);
    } else {
        var token = obj.data['token'];
        privates['token'] = token;
        callback();
    }
  })
}

function get_household() {
    var options = build_options('/api/household?with[]=household', 'GET', privates['token']);
    do_request('get_household', options, '', function(obj) {
        privates['household'] = obj.data[0]['id'];
        adapter.setState('connected',true, true, function(err) {
            adapter.log.info('connected...');
            timeout_callback();
        });
    });
}

function set_pets() {
    var len = privates.pets.length;
    for (let i = 0; i < len; i++) {
        var name = privates.pets[i].name;
        var where = privates.pets[i].position.where;
        var since = privates.pets[i].position.since;
        adapter.log.info(name + ' is ' + where + ' since ' + prettyMs(Date.now() - new Date(since)));

        let household_name = '';
        for (let j = 0; j < privates.households.length;j++) {
            if (privates.households[j].id === privates.pets[i].household_id) {
                household_name = privates.households[j].name;
                break;
            }
        }

        let prefix = household_name + '.pets';
        adapter.getObject(prefix, function(err, obj) { 
            if (!obj) {
                adapter.setObject(prefix, {
                    type: 'channel',
                    common: {
                        name: 'Pets in household ' + household_name + ' (' + privates.pets[i].household_id + ')',
                        role: 'info'
                    },
                    native: {}
                });
            }
        });

        if (!privates_prev.pets || (where !== privates_prev.pets[i].position.where)) {
            var obj_name = prefix + '.' + i;
            adapter.setObject(obj_name, {
                type: 'state',
                common: {
                    name: name,
                    type: 'boolean',
                    role: 'indicator',
                    icon: 'surepetcareio.png',
                    read: true,
                    write: false
                },
                native: {}
            });

            adapter.setState(obj_name, (where == 1) ? true : false, true);
        }
    }
}

function set_status() {
    // all devices online status
    if (!privates_prev.all_devices_online || (privates.all_devices_online !== privates_prev.all_devices_online)) {
        let obj_name = 'all_devices_online';
        adapter.getObject(obj_name, function(err, obj) { 
            if (!obj) {
                adapter.setObject(obj_name, {
                type: 'state',
                common: {
                    name: 'all devices online',
                    role: 'indicator',
                    type: 'boolean',
                    read: true,
                    write: false,
                },
                native: {}
                });
            }
        });
        adapter.setState(obj_name, privates.all_devices_online, true);
    }

    if (!privates_prev.offline_devices || (privates.offline_devices !== privates_prev.offline_devices)) {
        let obj_name = 'offline_devices';
        adapter.getObject(obj_name, function(err, obj) { 
            if (!obj) {
                adapter.setObject(obj_name, {
                type: 'state',
                common: {
                    name: 'offline devices',
                    role: 'indicator',
                    type: 'text',
                    read: true,
                    write: false,
                },
                native: {}
                });
            }
        });
        adapter.setState(obj_name, privates.offline_devices.join(';'), true);
    }

    for(let h = 0; h < privates.households.length; h++) {
        let prefix = privates.households[h].name + '.devices';
       
        adapter.getObject(prefix, function(err, obj) { 
            if (!obj) {
                adapter.setObject(prefix, {
                    type: 'channel',
                    common: {
                        name: 'Devices in household ' + privates.households[h].name + ' (' + privates.households[h].id + ')',
                        role: 'info'
                    },
                    native: {}
                });
            }
        });

        for(let d = 0; d < privates.devices.length; d++) {
            if (privates.devices[d].household_id ==  privates.households[h].id) {
                let obj_name =  prefix + '.' + privates.devices[d].name;
                adapter.getObject(obj_name, function(err, obj) { 
                    if (!obj) {
                        adapter.setObject(obj_name, {
                        type: 'channel',
                        common: {
                            name: privates.devices[d].name,
                            role: ''
                        },
                        native: {}
                        });
                    }
                });
            }
        }
    }
    for(let h = 0; h < privates.households.length; h++) {
        let prefix = privates.households[h].name + '.devices';
       
        for(let d = 0; d < privates.devices.length; d++) {
            if (privates.devices[d].household_id ==  privates.households[h].id) {

                if ('parent' in privates.devices[d]) {
                    // locking status
                    let locking_mode_changed = false;
                    if (!privates_prev.devices || (privates.devices[d].status.locking.mode !== privates_prev.devices[d].status.locking.mode)) {
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.' + 'locking';
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: 'locking',
                                        role: 'indicator',
                                        type: 'number',
                                        read: true,
                                        write: false,
                                        states: {0: 'OPEN', 1:'LOCKED INSIDE', 2:'LOCKED OUTSIDE', 3:'LOCKED BOTH', 4:'CURFEW' }
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.locking.mode, true);
                        locking_mode_changed = true;
                    }

                    // battery status
                    if (!privates_prev.devices || (privates.devices[d].status.battery !== privates_prev.devices[d].status.battery)) {
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.' + 'battery';
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: 'battery',
                                        role: 'indicator',
                                        type: 'number',
                                        read: true,
                                        write: false,
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.battery, true);
                    }

                    if (!privates_prev.devices || (privates.devices[d].status.battery_percentage !== privates_prev.devices[d].status.battery_percentage)) {
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.' + 'battery_percentage';
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: 'battery_percentage',
                                        role: 'indicator',
                                        type: 'number',
                                        read: true,
                                        write: false,
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.battery_percentage, true);
                    }


                    // lock control
                    if (locking_mode_changed) {
                        let control_name = 'lockinside';
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.control.' + control_name;
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: control_name,
                                        role: 'switch',
                                        type: 'boolean',
                                        read: true,
                                        write: true,
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.locking.mode === 1, true);
                    }

                    if (locking_mode_changed) {
                        let control_name = 'lockoutside';
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.control.' + control_name;
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: control_name,
                                        role: 'switch',
                                        type: 'boolean',
                                        read: true,
                                        write: true,
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.locking.mode === 2, true);
                    }

                    if (locking_mode_changed) {
                        let control_name = 'lockboth';
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.control.' + control_name;
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: control_name,
                                        role: 'switch',
                                        type: 'boolean',
                                        read: true,
                                        write: true,
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.locking.mode === 3, true);
                    }

                } else {
                    if (!privates_prev.devices || (privates.devices[d].status.led_mode !== privates_prev.devices[d].status.led_mode)) {
                        let obj_name =  prefix + '.' + privates.devices[d].name + '.' + 'led_mode';
                        adapter.getObject(obj_name, function(err, obj) { 
                            if (!obj) {
                                adapter.setObject(obj_name, {
                                    type: 'state',
                                    common: {
                                        name: 'led_mode',
                                        role: 'indicator',
                                        type: 'number',
                                        read: true,
                                        write: false,
                                        states: {0: 'OFF', 1:'HIGH', 4:'DIMMED' }
                                    },
                                    native: {}
                                });
                            }
                        });
                        adapter.setState(obj_name, privates.devices[d].status.led_mode, true);
                    }
                }
                // online status
                if (!privates_prev.devices || (privates.devices[d].status.online !== privates_prev.devices[d].status.online)) {
                    let obj_name =  prefix + '.' + privates.devices[d].name + '.' + 'online';
                    adapter.getObject(obj_name, function(err, obj) { 
                        if (!obj) {
                        adapter.setObject(obj_name, {
                                type: 'state',
                                common: {
                                    name: 'online',
                                    role: 'indicator',
                                    type: 'boolean',
                                    read: true,
                                    write: false,
                                },
                                native: {}
                            });
                        }
                    });
                    adapter.setState(obj_name, privates.devices[d].status.online, true);
                }
            }                
        }
    }
}

Number.prototype.between = function(a, b) {
    var min = Math.min(a, b),
      max = Math.max(a, b);
  
    return this > min && this < max;
};

function calculate_battery_percentage(battery)
{
    if (battery <= 4.8) {
        return 0.0;
    } else if (battery.between(4.8, 5.1)) {
        return 25.0;
    } else if (battery.between(5.1, 5.4)) {
        return 75.0;
    } else if (battery.between(5.4, 5.6)) {
        return 100.0;
    }
    return -1.0;
}

function get_control(callback) {
    var options = build_options('/api/me/start', 'GET', privates['token']);
    do_request('get_control', options, '', function(obj) {
        privates_prev = JSON.parse(JSON.stringify(privates));
        privates.devices = obj.data.devices;
        privates.households = obj.data.households;
        privates.pets = obj.data.pets;
        
        privates.all_devices_online = true;
        privates.offline_devices = [];
        for (let d = 0; d < privates.devices.length; d++) {
            privates.all_devices_online = privates.all_devices_online && privates.devices[d].status.online;
            if (!privates.devices[d].status.online) {
                privates.offline_devices.push(privates.devices[d].name);
            }
            if (privates.devices[d].status.battery) {
                privates.devices[d].status.battery_percentage = calculate_battery_percentage(privates.devices[d].status.battery);
            }
        }

        set_status();

        callback();
    });
}

function set_lockmode(device, lockmode) {
    var device_id = 0;
    for (var i=0; i < privates.devices.length; i++) {
        if (privates.devices[i].name === device) {
            device_id = privates.devices[i].id;
        }
    }

     var postData = JSON.stringify( { 'locking':lockmode } );
     var options = build_options('/api/device/' + device_id + '/control', 'PUT', privates['token']);
  
     do_request('set_lockmode', options, postData, function(obj) {
        adapter.log.info('locking mode changed to ' + lockmode);
     });
}