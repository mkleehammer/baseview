define('BaseView', function() {
  'use strict';

  var BaseView = Backbone.View.extend({

    ignoreWarningsButton: null,
    // By default, non-modal views (see BaseModalView below) do not support warning buttons. Set
    // to a selector identifying the submit / save button to enable 'ignore warning' support.

    _initPromises: null,

    __viewStateTemplate: 'baseview/view-state',

    constructor: function(options) {

      this.mergeEvents();

      this.__initializing = true;
      // Allows us to detect when we are in the initialize method which the default construtor
      // will call.

      Backbone.View.apply(this, arguments);

      delete this.__initializing;

      this.$el.on('baseview-removed', this, function(event) {
        var view = event.data;
        view._cleanUp();
      });

      if (this.backboneEvents)
        this.delegateBackboneEvents();

      this.$el.data('view', this);
      // Attach this instance to the HTML element.  Since HTML elements can always be found
      // using jQuery or native selectors, you don't need to keep pointers to views manually.

      if (this._initPromises && this._initPromises.length) {
        // Init promises were added, so wait for them and trigger the resolved method.

        $.when.apply(null, this._initPromises)
          .then(this.onInitPromisesResolved.bind(this),
                this.onInitPromisesFailed.bind(this));

        delete this._initPromises;
      }
    },

    addInitPromise: function(promise) {
      // Adds a promise to the list of those that must be fulfilled before initialization is
      // considered complete.
      //
      // When all added promises resolve, onInitPromisesResolved is called.  If any fail,
      // onInitPromisesFailed is called and all further promise activity is ignored.
      //
      // Since promises may already be resolved, this should only be used within the initialize
      // method.  If you add some promises within initialize and try to add some later, the
      // first ones may all complete before you get the chance to add more.  If you run into
      // problems like this, you can always add a promise that you resolve when you add further
      // promises ;).

      if (!this.__initializing) {
        throw new Error('init promises can only be added in the initialize method!');
      }

      if (!this._initPromises) {
        this._initPromises = [promise];

        if (this.__state !== 'blank' && this.__state !== 'loading') {
          this.setViewLoading();
        }
      } else {
        this._initPromises.push(promise);
      }
    },

    onInitPromisesResolved: function() {
      // All of the init promises have completed.  Note that this is *not* called unless init
      // promises have been added.
      if (!this.__state || this.__state === 'blank' || this.__state === 'loading') {
        this.setViewNormal();
      }
    },

    onInitPromisesFailed: function() {
      // TODO: I'm not sure what to do when an init rejection occurs.  I'd like to switch to
      // not found or an error view, but I need to see what kinds of things I get here.  For
      // example, we already have a global ajax error handler.
    },

    setViewBlank: function() {
      if (this.__viewState !== 'blank') {
        this.__viewState = 'blank';
        if (this.el) {
          this.render();
        }
      }
    },

    setViewLoading: function() {
      if (this.__viewState !== 'loading') {
        this.__viewState = 'loading';
        if (this.el) {
          this.render();
        }
      }
    },

    setViewNotFound: function() {
      this.__viewState = 'not-found';
      if (this.el) {
        this.render();
      }
    },

    setViewNormal: function() {
      delete this.__viewState;
      if (this.el) {
        this.render();
      }
    },

    _cleanUp: function() {
      this.stopListening();
      this.cleanUp();
    },

    cleanUp: function() {
      // If you override, don't forget to call the parent class' version.
    },

    remove: function() {
      this.cleanUp();
      Backbone.View.prototype.remove.call(this);
    },

    render: function(ctx) {
      // A default render method that uses `this.template` as a Handlebars template.  If no
      // context is provided (the default), this.model will be used.  If not defined,
      // this.collection will be used.

      if (this.__viewState) {
        this.renderTemplate(this.__viewStateTemplate, { state: this.__viewState });
        return this;
      }

      if (this.template) {

        // If render was called due to an event (such as watching a collection) we will be passed
        // an event.  Ignore.
        if (ctx && ctx._events) {
          ctx = undefined;
        }

        // If there is no context, default to `this.model` or `this.collection`.
        ctx = this.getTemplateContext();

        this.renderTemplate(this.template, ctx);

        var autofocus = this.autofocus ? $(this.autofocus) : this.$('[autofocus]');

        // Since this.el hasn't been added to the DOM yet (that usually happens
        // after this method returns), set focus afterwards.  This also allows us
        // to perform the search for visible items.
        setTimeout(function() {
          if (autofocus.length === 0) {
            // Autofocus has not been explicitly set so set it to the first visible,
            // enabled component.
            autofocus = this.$('input,textarea,select').filter(':visible:enabled:first');
          }

          if (autofocus.length)
            autofocus.focus();

        }.bind(this), 0);
      }

      this.postRender();

      this.initializeWarningButton();

      // Optional callback used *after* this view is added to the page (DOM).  At this point this.$el
      // exists but probably hasn't been added to the page by the parent yet since the parent is calling
      // render and we haven't returned yet:
      //
      // var view = new ChildView();
      // view.render(); // <-- We are here!!!
      // $(body).append(view.el);
      //  ... timeout ...
      // view.initializeDOM is called here

      var initializeDOM = this.initializeDOM;
      if (initializeDOM) {
        setTimeout(initializeDOM.bind(this), 0);
      }

      // Trigger a Backbone event, used by the testing framework.  This should
      // probably take the place of initializeDOM everywhere.
      setTimeout(function() {
        this.trigger('rendered');
      }.bind(this), 0);

      return this;
    },

    initializeWarningButton: function() {
      if (this.ignoreWarningsButton) {
        var btn = this.$(this.ignoreWarningsButton);
        this.ignoreWarningsButtonInfo = {
          btn: btn,
          originalText: btn.text(),
          originalClass: btn.attr('class'),
          warningMode: false
        };
      }
    },

    setWarningButtonMode: function(flag) {
      if (flag) {
        var warnings = this.$('.has-warning');
        console.assert(warnings.length !== 0);
        var text = (warnings.length === 1) ? 'Ignore Warning' : 'Ignore ' + warnings.length + ' Warnings';
        this.ignoreWarningsButtonInfo.btn
          .removeClass('btn-primary btn-default')
          .addClass('btn-warning')
          .text(text);
      } else {
        this.ignoreWarningsButtonInfo.btn
          .removeClass('btn-warning')
          .addClass(this.ignoreWarningsButtonInfo.originalClass)
          .text(this.ignoreWarningsButtonInfo.originalText);
      }
      this.ignoreWarningsButtonInfo.warningMode = flag;
    },

    getTemplateContext: function() {
      // Called when the normal template (not view state template) is being executed to
      // determine the data to pass to the template.
      //
      // The default behavior is to pass `this` to the template, so it has access to everything
      // in the view object.  If you need to calculate a lot of values, override this and
      // return a custom object.
      //
      // If you have a single property (e.g. `this.patient`) you want to pass to the template,
      // you can set `templateContext` to the property name (e.g. "patient").

      var ctx;
      if (this.templateContext) {
        ctx = this.templateContext;
        if (ctx == null)
          ctx = {};
        else if (typeof ctx === 'string')
          ctx = this[ctx];
      } else {
        ctx = this;
      }
      return ctx;
    },

    renderTemplate: function(template, ctx) {
      var func = Handlebars.templates[template];
      // I had an assertion, but Safari is not printing the message when an
      // assertion fails so we don't get the template.
      if (!func)
        throw new Error('No template named "' + template + '"');
      this.$el.html(func(ctx));
    },

    postRender: function() {
      // A hook for subclasses that is called at the end of the `render` method.
    },

    mergeEvents: function() {
      // Merges events with parent views.  Adds a '_mergedEvents' flag to the prototype since
      // they must not be merged twice.
      //
      // Perhaps this could be more efficient if we merged parent events on the way up, but I
      // don't expect the heirarchies to be that deep.

      var ours = Object.getPrototypeOf(this);

      if (!ours.hasOwnProperty('events')) {
        return;
      }

      if (getOwnProperty(ours, '_mergedEvents')) {
        return;
      }

      var events = ours.events;
      var parent = Object.getPrototypeOf(ours);
      while (parent) {
        if (getOwnProperty(parent, '_mergedEvents'))
          break;

        if (parent.hasOwnProperty('events')) {
          // Manually copy only those that don't already exist so that children can override
          // parents.
          var e = parent.events;
          for (var key in e) {
            if (e.hasOwnProperty(key) && !events.hasOwnProperty(key)) {
              events[key] = e[key];
            }
          }
        }
        parent = Object.getPrototypeOf(parent);
      }

      ours._mergedEvents = true;
    },

    delegateBackboneEvents: function() {
      // Hookup listeners for events on the Backbone event bus.

      var name, value, func;

      for (name in this.backboneEvents) {
        value = this.backboneEvents[name];
        func = this[value];
        console.assert(func, 'No method exists with name "' + value + '"');
        this.listenTo(Backbone, name, $.proxy(func, this));
      }
    },

    serialize: function serialize(options) {
      options = $.extend({}, options);
      this.updateSerializeOptions(options);
      return this.$el.serializeJSON(options);
    },

    updateSerializeOptions: function updateSerializeOptions(options) {
      // A hook for subclasses and mixins to augment the options object passed to serializeJSON
      // (from json.js).
    }
  });

  // The BaseView *class* is also an Events instance so we can emit events when views are
  // created and deleted.  This is an easy hook to allow testing frameworks to monitor things.

  _.extend(BaseView, Backbone.Events);

  // http://stackoverflow.com/a/7989120
  //
  // This is a major hack, but it works well :) We need to clean up after our views, even when
  // parent views blow away all child views using `this.$el.html()`.  Fortunately jQuery has
  // the same need and solves it by calling $.cleanData for every DOM element that has a jQuery
  // object when it is removed from the DOM.  We simply hook into that and see if there are
  // views.

  var oldClean = jQuery.cleanData;

  $.cleanData = function(elems) {
    // Note: If you convert this to an actual event, make sure it does not bubble up.
    for (var i = 0, c = elems.length; i < c; i++) {
      $(elems[i]).triggerHandler('baseview-removed');
    }
    oldClean(elems);
  };

  return BaseView;
});
