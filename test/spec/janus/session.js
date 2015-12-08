var _ = require('underscore');
var chai = require('chai');
var assert = chai.assert;
var expect = chai.expect;
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var sinon = require('sinon');

var Promise = require('bluebird');
require('../../helpers/global-error-handler');
var JanusConnection = require('../../../lib/janus/connection');
var PluginRegistry = require('../../../lib/janus/plugin-registry');
var PluginAbstract = require('../../../lib/janus/plugin/abstract');
var Transactions = require('../../../lib/janus/transactions');
var Logger = require('../../../lib/logger');
var Session = require('../../../lib/janus/session');
var serviceLocator = require('../../../lib/service-locator');

describe('Session', function() {
  var session, connection;

  beforeEach(function() {
    serviceLocator.register('logger', sinon.stub(new Logger));
    connection = new JanusConnection();
    session = new Session(connection, 'session-id', 'session-data');
    session.pluginRegistry = sinon.createStubInstance(PluginRegistry);
  });

  it('should store connection, id and data', function() {
    expect(session.connection).to.be.equal(connection);
    expect(session.id).to.be.equal('session-id');
    expect(session.data).to.be.equal('session-data');
  });

  it('should have empty plugins collection', function() {
    expect(session.plugins).to.be.deep.equal({});
  });

  context('when processes "attach" message', function() {
    beforeEach(function() {
      var message = {
        janus: 'attach',
        plugin: 'plugin-type',
        token: 'token'
      };
      sinon.spy(connection.transactions, 'add');
      session.pluginRegistry.instantiatePlugin.returns('plugin-instance');
      session.pluginRegistry.isAllowedPlugin.returns(true);
      session.processMessage(message);
    });

    it('transaction should be added', function() {
      assert(connection.transactions.add.calledOnce);
    });

    it('on successful transaction response should add plugin', function() {
      var transactionCallback = connection.transactions.add.firstCall.args[1];
      transactionCallback({
        janus: 'success',
        data: {
          id: 'plugin-id'
        }
      });
      assert(session.pluginRegistry.instantiatePlugin.withArgs('plugin-id', 'plugin-type', session).calledOnce);
      expect(_.size(session.plugins)).to.be.equal(1);
      expect(session.plugins).to.have.property('plugin-id');
      expect(session.plugins['plugin-id']).to.be.equal('plugin-instance');
    });
  });

  context('when processes "detached" message', function() {
    beforeEach(function() {
      var message = {
        janus: 'detached',
        sender: 'plugin-id',
        token: 'token'
      };
      sinon.stub(session, '_removePlugin');
      session.processMessage(message);
    });

    it('should remove plugin', function() {
      assert(session._removePlugin.withArgs('plugin-id').calledOnce);
    });
  });

  context('when processes "hangup" message', function() {
    beforeEach(function() {
      var message = {
        janus: 'hangup',
        sender: 'plugin-id',
        token: 'token'
      };
      sinon.stub(session, '_removePlugin');
      session.processMessage(message);
    });

    it('should remove plugin', function() {
      assert(session._removePlugin.withArgs('plugin-id').calledOnce);
    });
  });

  context('when removes plugin', function() {
    beforeEach(function() {
      session.plugins['plugin-id'] = sinon.createStubInstance(PluginAbstract);
      session.plugins['other-plugin-id'] = sinon.createStubInstance(PluginAbstract);
    });


    it('should remove it from plugins collection', function() {
      expect(_.size(session.plugins), 2);
      expect(session.plugins).to.have.property('plugin-id');
      session._removePlugin('plugin-id');
      expect(_.size(session.plugins), 1);
      expect(session.plugins).to.not.have.property('plugin-id');
    });

    it('should trigger onRemove', function() {
      var plugin = session.plugins['plugin-id'];
      session._removePlugin('plugin-id');
      assert(plugin.onRemove.calledOnce);
    });
  });

  context('when processes plugin-related message', function() {
    var message = {
      janus: 'message',
      handle_id: 'plugin-id'
    };

    it('should reject on non-existing plugin', function(done) {
      expect(session.processMessage(message)).to.be.eventually.rejectedWith(Error, 'Invalid plugin id').and.notify(done);
    });

    it('should proxy message to plugin', function() {
      var plugin = sinon.createStubInstance(PluginAbstract);
      session.plugins['plugin-id'] = plugin;
      plugin.processMessage.restore();
      sinon.stub(plugin, 'processMessage', function() {
        return Promise.resolve();
      });
      session.processMessage(message);
      assert(plugin.processMessage.withArgs(message).calledOnce);
    });
  });
});
