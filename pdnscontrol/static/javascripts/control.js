// Controlling Application
var ControlApp = angular.module('control', ['models', 'components', 'graphite', 'ngGrid']);

////////////////////////////////////////////////////////////////////////
// Shared object resolver functions
////////////////////////////////////////////////////////////////////////

function ServerResolver(Restangular, $route) {
  return Restangular.one('servers', $route.current.params.serverName).get();
}

function ZoneResolver(Restangular, $route) {
  return Restangular.one('servers', $route.current.params.serverName).one('zones', $route.current.params.zoneName).get();
}

////////////////////////////////////////////////////////////////////////
// Routing
////////////////////////////////////////////////////////////////////////

ControlApp.
  config(function($routeProvider, $locationProvider) {
    moment.lang('en');
    $locationProvider.html5Mode(true);
    $routeProvider.
      when('/', {controller:ServerListCtrl, templateUrl: templateUrl('server/list')}).
      when('/server/:serverName', {
        controller:ServerDetailCtrl, templateUrl: templateUrl('server/detail'),
        resolve: {
          server: ServerResolver
        }
      }).
      when('/server/:serverName/edit', {
        controller:ServerEditCtrl, templateUrl: templateUrl('server/edit'),
        resolve: {
          server: ServerResolver
        }
      }).
      when('/server/:serverName/zone/:zoneName', {
        controller:ZoneDetailCtrl, templateUrl: templateUrl('zone/detail'),
        resolve: {
          server: ServerResolver,
          zone: ZoneResolver
        }
      }).
      when('/servers/new', {controller: ServerCreateCtrl, templateUrl: templateUrl('server/edit')}).
      otherwise({redirectTo: '/'});
  });

////////////////////////////////////////////////////////////////////////
// Filters
////////////////////////////////////////////////////////////////////////

ControlApp.
  filter('relative_time', function() {
    return function(value) {
      if (value === undefined) {
        return 'unknown';
      }
      return moment.duration(1.0 * value, "seconds").humanize();
    }
  }).
  filter('absolute_time', function() {
    return function(value) {
      if (value === undefined) {
        return '';
      }
      var m = moment().subtract('seconds', value);
      return m.format('LLLL') + " (" + m.fromNow() + ")";
    }
  }).
  filter('absolute_date', function() {
    return function(value) {
      if (value === undefined) {
        return 'unknown';
      }
      return moment(value).fromNow();
    }
  });


ControlApp.directive('searchlog', function() {
  return {
    restrict: 'E',
    templateUrl: templateUrl('server/search_log_directiv'),
    replace: true,
    scope: {
      servers: '&servers'
    },
    controller: ['$scope', '$compile', function($scope, $compile) {
      $scope.query = '';
      $scope.load_error = '';
      $scope.submit = function() {
        if ($scope.query.length == 0) {
          return;
        }
        var servers = $scope.servers();
        if (angular.isFunction(servers)) {
          // happens when we use a scope function as arg to servers=.
          servers = servers();
        }
        showPopup($scope, $compile, 'server/search_log', function(popupScope) {
          popupScope.logData = [];
          popupScope.logSearchGrid = {
            data: 'logData',
            enableRowSelection: false,
            columnDefs: [
              {field: 'date', displayName: 'Date', width: 200, cellFilter: 'absolute_date'},
              {field: 'hostname', displayName: 'Hostname', width: '80'},
              {field: 'message', displayName: 'Message',}
            ]
          };

          _.each(servers, function(server) {
            server.log_grep({needle: $scope.query}).then(function(response) {
              popupScope.logData.push.apply(popupScope.logData, _.map(response.content, function(line) {
                var date_hostname = line.split(' ', 2);
                var message = line.substring(date_hostname[0].length + date_hostname[1].length + 2);
                return {
                  date: date_hostname[0],
                  hostname: date_hostname[1],
                  message: message
                };
              }));
            }, function(response) {
              $scope.load_error += 'Search failed for server X';
            });
          });

        });
      };
    }]
  }
});

ControlApp.directive('spinner', function() {
  return {
    restrict: 'E',
    template: '<div class="inline-block"></div>',
    replace: true,
    scope: {
      spin: '@'
    },
    link: function(scope, elm, attrs) {
      scope.spinning = false;
      var spinner = new Spinner({
        lines: 11, // The number of lines to draw
        length: 5, // The length of each line
        width: 2, // The line thickness
        radius: 6, // The radius of the inner circle
        corners: 1, // Corner roundness (0..1)
        rotate: 0, // The rotation offset
        direction: 1, // 1: clockwise, -1: counterclockwise
        color: '#000', // #rgb or #rrggbb
        speed: 1.0, // Rounds per second
        trail: 56, // Afterglow percentage
        shadow: false, // Whether to render a shadow
        hwaccel: true, // Whether to use hardware acceleration
        className: 'spinner', // The CSS class to assign to the spinner
        zIndex: 2e9, // The z-index (defaults to 2000000000)
        top: '-18', // Top position relative to parent in px
        left: '-20' // Left position relative to parent in px
      });

      attrs.$observe('spin', function() {
        var spin = (scope.spin === 'true');
        if (scope.spinning != spin) {
          if (spin == true) {
            spinner.spin(elm[0]);
          } else {
            spinner.stop();
          }
          scope.spinning = spin;
        }
      });
    }
  }
});


////////////////////////////////////////////////////////////////////////
// Servers
////////////////////////////////////////////////////////////////////////

function ServerListCtrl($scope, $compile, Restangular) {
  Restangular.all("servers").getList().then(function(servers) {
    $scope.servers = servers;
    _.each($scope.servers, function(server) {
      server.selected = true;
    });
  });

  $scope.orderProp = 'name';

  $scope.recursors = function() {
    return _.filter($scope.servers, function(server) { return server.daemon_type == 'Recursor'; });
  }

  $scope.recursor_answers = function() {
    var sources, servers;
    servers = _.filter($scope.servers, function(server) { return server.daemon_type == 'Recursor'; });

    sources = _.map(['answers0-1', 'answers1-10', 'answers10-100', 'answers100-1000', 'answers-slow', 'packetcache-hits'], function(val) {
      return 'nonNegativeDerivative(%SOURCE%.' + val + ')';
    }).join(',');

    servers = _.map(servers, function(server) {
      var source = server.graphite_name;
      return 'sumSeries(' + sources.replace(/%SOURCE%/g, source) + ')';
    });

    return "sumSeries(" + servers.join(',') + ")";
  };

  $scope.recursor_queries = function() {
    var sources, servers;
    servers = _.filter($scope.servers, function(server) { return server.daemon_type == 'Recursor'; });

    sources = _.map(['answers0-1', 'answers1-10', 'answers10-100', 'answers100-1000', 'answers-slow', 'packetcache-hits'], function(val) {
      return 'nonNegativeDerivative(%SOURCE%.' + val + ')';
    }).join(',');

    servers = _.map(servers, function(server) {
      var source = server.graphite_name;
      return 'sumSeries(' + sources.replace(/%SOURCE%/g, source) + ')';
    });

    return "sumSeries(" + servers.join(',') + ")";
  };

  $scope.selected_servers = function() {
    // TODO: apply 'filter' filter (name match)
    return _.filter($scope.servers, function(server) { return server.selected; });
  };

  $scope.toggleSelectedAll = function() {
    _.each($scope.servers, function(server) {
      server.selected = $scope.selected_all;
    });
  };

  $scope.refreshSelectedAll = function() {
    $scope.selected_all = _.every($scope.servers, function(server) {
      return server.selected;
    });
  };

  $scope.popup_flush_cache = function() {
    showPopup($scope, $compile, 'server/flush_cache_multi', function(scope) {
      scope.loading = false;
      scope.affected_servers = $scope.selected_servers();
      console.log('servers:', scope.affected_servers);
      scope.doIt = function() {
        var requestCount = scope.affected_servers.length;
        scope.results = [];
        scope.loading = true;
        _.each(scope.affected_servers, function(server) {
          server.flush_cache({'domain': scope.flush_domain}).then(function(response) {
            scope.results.push({server: server, output: '' + response.content.number + ' domains flushed.'});
            requestCount -= 1;
            if (requestCount == 0) {
              scope.loading = false;
            }
          }, function(response) {
            scope.results.push({server: server, output: 'Failed.'});
            scope.loading = false;
            requestCount -= 1;
            if (requestCount == 0) {
              scope.loading = false;
            }
          });
        });
      }
      // HACK: don't rely on setTimeout(, >0) here when we could use (, 0) or a callback from showPopup
      setTimeout(function() {
        angular.element("#flush_domain").focus();
      }, 100);
    });
  };

  $scope.popup_shutdown = function() {
    showPopup($scope, $compile, 'server/shutdown_multi.html', function(scope) {
      scope.loading = false;
      scope.affected_servers = $scope.selected_servers();
      scope.doIt = function() {
        var requestCount = scope.affected_servers.length;
        function reqDone() {
          requestCount -= 1;
          if (requestCount == 0) {
            scope.loading = false;
          }
        }
        scope.results = [];
        scope.loading = true;
        _.each(scope.affected_servers, function(server) {
          server.stop({}).then(function(response) {
            try {
              var output = '$ ' + response.cmdline.join(' ') + "\n" + response.output;
              scope.results.push({server: server, output: output});
            } catch (e) {
              scope.results.push({server: server, output: 'Response not understood.'});
            } finally {
              reqDone();
            }
          }, function(response) {
            scope.results.push({server: server, output: 'Request Failed.'});
            reqDone();
          });
        });
      }
    });
  };

  $scope.popup_restart = function() {
    showPopup($scope, $compile, 'server/restart_multi', function(scope) {
      scope.loading = false;
      scope.affected_servers = $scope.selected_servers();
      scope.doIt = function() {
        var requestCount = scope.affected_servers.length;
        function reqDone() {
          requestCount -= 1;
          if (requestCount == 0) {
            scope.loading = false;
          }
        }
        scope.results = [];
        scope.loading = true;
        _.each(scope.affected_servers, function(server) {
          server.restart({}).then(function(response) {
            try {
              var output = '$ ' + response.cmdline.join(' ') + "\n" + response.output;
              scope.results.push({server: server, output: output});
            } catch (e) {
              scope.results.push({server: server, output: 'Response not understood.'});
            } finally {
              reqDone();
            }
          }, function(response) {
            scope.results.push({server: server, output: 'Request Failed.'});
            reqDone();
          });
        });
      }
    });
  };
}

function ServerCreateCtrl($scope, $location, Restangular) {
  window.CC = this;
  $scope.save = function() {
    Restangular.all("servers").post($scope.server).then(function(response) {
      $location.path('/server/' + server.name);
    }, function(response) {
      if (response.status == 422) {
        _.each(response.data.errors, function(field, desc) {
          $scope.serverForm.$setValidity("serverForm." + field + ".$invalid", false);
        });
      } else {
        alert('Server reported unexpected error ' + response.status);
      }
    });
  }
}

function ServerDetailCtrl($scope, $compile, $location, Restangular, server) {
  $scope.server = server;
  console.log('ServerDetailCtrl', server);

  $scope.flush_cache = function() {
    alert('flush!');
  };

  $scope.shutdown = function() {
    alert('shutdown');
  };

  $scope.zonesGridOptions = {
    data: 'zones',
    enableRowSelection: false,
    columnDefs: [
      {field: 'name', displayName: 'Name', cellTemplate: '<div class="ngCellText"><a href="/server/{{server._id}}/zone/{{row.entity[col.field]}}/">{{row.entity[col.field]}}</div></a>'},
      {field: 'kind', displayName: 'Kind'}
    ]
  };
  if ($scope.server.daemon_type == 'Recursor') {
    $scope.zonesGridOptions.columnDefs.push({field: 'forwarders', displayName: 'Forwarders'});
    $scope.zonesGridOptions.columnDefs.push({field: 'rdbit', displayName: 'Recursion Desired', cellFilter: 'checkmark'});
  } else {
    $scope.zonesGridOptions.columnDefs.push({field: 'masters', displayName: 'Masters'});
    $scope.zonesGridOptions.columnDefs.push({field: 'serial', displayName: 'Serial'});
  }

  function loadServerData() {
    console.log("loadServerData()");
    $scope.server.all("zones").getList().then(function(zones) {
      $scope.zones = zones;
    }, function(response) {
      $scope.load_error = $scope.load_error || '';
      $scope.load_error += 'Loading zones failed';
    });

    $scope.configuration = _.pairs($scope.server.config);
    $scope.configurationGridOptions = {
      data: 'configuration',
      enableRowSelection: false,
      columnDefs: [
        {field: '0', displayName: 'Name'},
        {field: '1', displayName: 'Value'}
      ]
    };

    $scope.statistics = _.pairs($scope.server.stats);
    $scope.statisticsGridOptions = {
      data: 'statistics',
      enableRowSelection: false,
      columnDefs: [
        {field: '0', displayName: 'Name'},
        {field: '1', displayName: 'Value'}
      ]
    };
  }
  loadServerData();

  $scope.popup_flush_cache = function() {
    showPopup($scope, $compile, 'server/flush_cache', function(scope) {
      scope.loading = false;
      scope.output = '';
      scope.doIt = function() {
        scope.loading = true;
        $scope.server.flush_cache({domain: scope.flush_domain}).then(function(response) {
          scope.output = '' + response.content.number + ' domains flushed.';
          scope.loading = false;
        }, function(response) {
          scope.output = 'Flushing failed.';
          scope.loading = false;
        });
      }
      // HACK: don't rely on setTimeout(, >0) here when we could use (, 0) or a callback from showPopup
      setTimeout(function() {
        angular.element("#flush_domain").focus();
      }, 100);
    });
  }

  $scope.popup_shutdown = function() {
    showPopup($scope, $compile, 'server/shutdown', function(scope) {
      scope.loading = false;
      scope.output = '';
      scope.succeeded = false;
      scope.doIt = function() {
        scope.loading = true;
        $scope.server.stop({}).then(function(response) {
          scope.output = '$ ' + response.cmdline.join(' ') + "\n" + response.output;
          scope.succeeded = response.success;
          scope.loading = false;
        }, function(response) {
          scope.output = 'Shutdown failed.';
          scope.loading = false;
        });
      }
    });
  }

  $scope.popup_restart = function() {
    showPopup($scope, $compile, 'server/restart', function(scope) {
      scope.loading = false;
      scope.output = '';
      scope.succeeded = false;
      scope.doIt = function() {
        scope.loading = true;
        $scope.server.restart({}).then(function(response) {
          scope.output = '$ ' + response.cmdline.join(' ') + "\n" + response.output;
          scope.succeeded = response.success;
          scope.loading = false;
          // reload server object, as everything might have changed now.
          $scope.server.get().then(function(s) {
            $scope.server = s;
            loadServerData();
          });
        }, function(response) {
          scope.output = 'Restart failed.';
          scope.loading = false;
        });
      }
    });
  }

  $scope.popup_deploy = function() {
    showPopup($scope, $compile, 'server/deploy', function(scope) {
    });
  }
}

function ServerEditCtrl($scope, $location, Restangular, server) {
  $scope.master = server;
  $scope.server = Restangular.copy($scope.master);

  $scope.isClean = function() {
    return angular.equals($scope.master, $scope.server);
  };

  $scope.destroy = function() {
    $scope.master.remove().then(function() {
      $location.path('/');
    });
  };

  $scope.save = function() {
    $scope.server.put().then(function() {
      $location.path('/server/' + $scope.server.name);
    });
  };
}


////////////////////////////////////////////////////////////////////////
// Zones
////////////////////////////////////////////////////////////////////////

function ZoneDetailCtrl($scope, $compile, $location, Restangular, server, zone) {
  var typeEditTemplate;

  $scope.server = server;

  $scope.master = zone;

  $scope.zone = Restangular.copy($scope.master);

  $scope.isClean = function() {
    return angular.equals($scope.master, $scope.zone);
  };

  $scope.isDeletePossible = function() {
    // Must have at least one selected row, and no row's type can have allowDelete=false.
    var selectedTypes;
    if ($scope.mySelections.length == 0)
      return false;
    selectedTypes = _.map($scope.mySelections, function(row) { return _.findWhere($scope.rrTypes, {name: row.type}); });
    return _.every(selectedTypes, function(type) {
      return (type.allowDelete === undefined) ? true : type.allowDelete;
    });
  };

  $scope.now = new Date();

  var rrTypesSort = function(a,b) {
    var typeA = _.findWhere($scope.rrTypes, {name: a});
    var typeB = _.findWhere($scope.rrTypes, {name: b});
    var weightA = typeA.sortWeight || 0;
    var weightB = typeB.sortWeight || 0;
    if (weightA < weightB) {
      return 1;
    }
    if (weightA > weightB) {
      return -1;
    }
    return a > b;
  };

  $scope.rrTypes = [
    {name: 'SOA', required: true, allowDelete: false, sortWeight: -100},
    {name: 'A'},
    {name: 'AAAA'},
    {name: 'NS'},
    {name: 'CNAME'},
    {name: 'MR'},
    {name: 'PTR'},
    {name: 'HINFO'},
    {name: 'MX'},
    {name: 'TXT'},
    {name: 'RP'},
    {name: 'AFSDB'},
    {name: 'SIG'},
    {name: 'KEY'},
    {name: 'LOC'},
    {name: 'SRV'},
    {name: 'CERT'},
    {name: 'NAPTR'},
    {name: 'DS'},
    {name: 'SSHFP'},
    {name: 'RRSIG'},
    {name: 'NSEC'},
    {name: 'DNSKEY'},
    {name: 'NSEC3'},
    {name: 'NSEC3PARAM'},
    {name: 'TLSA'},
    {name: 'SPF'},
    {name: 'DLV'}
  ];
  typeEditTemplate = '<select ng-model="COL_FIELD" required ng-options="rrType.name as rrType.name for rrType in rrTypes"></select>';

  $scope.mySelections = [];
  $scope.rrsetsGridOptions = {
    data: 'zone.rrsets',
    enableRowSelection: true,
    enableCellEditOnFocus: true,
    showSelectionCheckbox: true,
    selectWithCheckboxOnly: true,
    showFilter: true,
    sortInfo: { fields: ['name', 'type', 'priority', 'content'], directions: ['ASC', 'ASC', 'ASC', 'ASC'] },
    selectedItems: $scope.mySelections,
    columnDefs: [
      {field: 'name', displayName: 'Name', enableCellEdit: true},
      {field: 'type', displayName: 'Type', width: '80', enableCellEdit: true, editableCellTemplate: typeEditTemplate, sortFn: rrTypesSort},
      {field: 'priority', displayName: 'Priority', width: '80', enableCellEdit: true},
      {field: 'ttl', displayName: 'TTL', width: '80', enableCellEdit: true},
      {field: 'content', displayName: 'Data', enableCellEdit: true},
    ]
  };
}