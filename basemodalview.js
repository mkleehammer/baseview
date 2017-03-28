
define('BaseModalView', function() {
  'use strict';

  var BaseView = require('BaseView');

  var BaseModalView = BaseView.extend({

    // Used for Bootstrap modals.  Set your template to a div of type 'modal' and call show.
    // Call dismiss to discard - do not call remove directly.
    //
    // Calling show returns a jQuery Deferred object which is similar to a
    // promise.  Calling dismiss resolves the promise with whatever value you pass
    // to dismiss.  (I'm using resolve for cancels also at the moment.)

    ignoreWarningsButton: 'button[type=submit]',

    events: {
      'hidden.bs.modal': 'onHidden',
      'submit' : 'preSubmit'
    },

    _backdrop: '<div class="loading-backdrop"></div>',

    onInitStart: function() {
      $(this._backdrop).appendTo(document.body);
    },

    onInitComplete: function() {
      $('.loading-backdrop').remove();
      if (this.deferred)
        this._show();
    },

    onInitFailed: function() {
      $('.loading-backdrop').remove();
      if (this.deferred)
        this._dismiss(false);
    },

    onHidden: function(e) {
    },

    preSubmit: function(e) {
      e.preventDefault();
      e.stopPropagation();

      if (!this.validate())
        return;

      this.submit();
    },

    submit: function() {
      // Called when a form is submitted and validation has been passed. Return 'false' to stop
      // the dismissal of the form.  You don't need to return anything, however.  (That is
      // returning `undefined` is considered success.)
    },

    validate: function() {
      // A hook.  Return false to stop the submission.
    },


    _show: function() {
      $(document.body).append(this.render().el);

      this.__modal = null;
      if (this.$el.hasClass('modal'))
        this.__modal = this.$el;
      else
        this.__modal = this.$('.modal');

      // If this fires, it means you forgot to set a div with class "modal".  See the Bootstrap
      // docs on modals.  Remember that Backbone views always create at least one element
      // around the template, so the best way to meet this requirement is to simply set "modal"
      // in your view's className attribute.
      //
      // Note: If this fires because you haven't rendered your view due to setViewLoading,
      // etc., you need to use the className item above!
      console.assert(this.__modal.length === 1, 'Modal needs 1 .modal not ' + this.__modal.length);

      // TODO
      console.log('Show the modal: $el=', this.$el);
      this.$el.css('display', 'block');


      // Emit an event on the *class* that we just displayed a modal.  This allows
      // testing frameworks to monitor things.
      BaseModalView.trigger('show', this);
    },

    show: function() {
      console.assert(!this.deferred, 'This modal has already been shown?');

      this.deferred = new $.Deferred();

      if (this._initPromises) {
        // There is already a loading indicator.  Wait until it completes.
      } else {
        this._show();
      }

      return this.deferred;
    },

    _dismiss: function(success, value) {
      // The dismiss implementation.

      if (this.deferred) {
        if (success)
          this.deferred.resolve(value);
        else
          this.deferred.reject();
        this.deferred = null;
      }

      if (this.__modal)
        this.__modal.modal('hide');
    },

    resolve: function(value) {
      // Dismisses the view and resolves the promise with the value.  The value is
      // optional and will be `undefined` if you don't pass one.
      this._dismiss(true, value);
    },

    reject: function() {
      this._dismiss(false);
    },

    cleanUp: function() {
      // Hook jQuery to perform last-minute clean up when the element is being
      // removed from the page.  If our promise has not be resolved or rejected,
      // reject it.

      if (this.deferred) {
        this._dismiss(false);
      }

      BaseView.prototype.cleanUp.call(this);
    }
  });

  return BaseModalView;

});
