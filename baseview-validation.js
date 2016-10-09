
// A mixin to add validation to views.  To use, add the following to your view:
//
//   mixins: ['validations'],
//
//
// Configuring Validation
// ----------------------
//
// To configure manual validation, populate a `validations` hash, mapping from
// control name to a validation function.  Control selectors are space
// separated, so the second line validation below is for two different controls.
//
//   validations: {
//     'ssn': 'validateSSN',
//     'price1 price2': 'validatePrices'
//   }
//
// You can append "?" if the control might not exist because it is added
// dynamically: { 'ssn?': 'validateSSN' }.  (The class will complain otherwise
// to help you track down typos.  Validations are important and we don't want
// them missed because you entered "snn" instead of "ssn".)
//
// If multiple controls are under the same form-group, add a group name using
// the form "name{group}".  The group will be assigned the most severe error of
// the controls in the group.  (That is, you don't want the 2nd control to clear
// the error set by the first control.)
//
//   validations: {
//     'date{delivery}' : 'validateDate',
//     'time{delivery}' : 'validateTime'
//   }
//
//
// Validation Functions
// --------------------
//
// Validation functions do not need to return anything if the field is valid.
// They can return an object with the following properties.  (Only return the
// ones you need.)
//
// :className - Added to the form-group, normally 'has-error' or 'has-warning'.
// :help - Help text to add.
// :val - text to repopulate the field, used to reformat the control text.
// :json - a value to attach as $(el).data('json', result.json)
//
//
// Auto-Validation from Schema
// ---------------------------
//
// You can also have automatic validation based on the database schema by
// setting `valdationTable` to the name of the table.  Any fields without manual
// validation that match column names will have simple validation applied from
// not-null and max length.
//
// maxlength
// ---------
//
// If you set the `validationTable` variable, each input with a name matching a
// varchar column will have its maxlength attribute set from the column width.

(function() {

  // jshint sub:true

  Cocktail.mixins['validation'] = {

    //
    // Public
    //

    validations: null,

    validationTable: null,

    initialize: function(options) {

      if (this.validations) {
        this._createValidations();
      }

      if (this.validationTable) {
        var SchemaCache = require('SchemaCache');
        var _this = this;
        this.addInitPromise(
          SchemaCache.get(this.validationTable)
            .then(function(schema) {
              _this._schema = schema;
            })
        );
      }
    },

    updateSerializeOptions: function updateSerializeOptions(options) {
      if (this._schema) {
        options.schema = this._schema;
      }
    },

    required: function(value, target) {
      // A simple validation function you can use.
      if (value == null || value === '') {
        return { className: 'has-error' };
      }

      return undefined;
    },

    manualValidate: function() {
      // Provided as a hook for base classes to perform manual validation when `validate`
      // is called.  This is executed after automatic validations from the `validations`
      // hash.
      //
      // To fail validation, simply add has-error or has-warning to something.
    },

    //
    // Implementation
    //

    _validationHelp: Handlebars.compile('<span class="help-block validation">{{this}}</span>'),

    _schema: null,
    // An object describing the schema of `validationTable`.  Obviously if validationTable is
    // null this will be null.

    _validations: null,
    // Maps from control name to a validation settings object.  These are
    // compiled from the entries in `validations` and columns in `validationTable`.

    _setMaxLengthsFromSchema: function() {
      console.assert(this._schema);
      _.each(this._schema.cols, function(col) {
        var field = this.$('[name=' + col.column_name + ']');
        if (field.length === 1 && col.maxlen && field[0].tagName === 'INPUT') {
          field.attr('maxlength', col.maxlen);
        }
      }, this);
    },

    postRender: function() {
      // Set the maxlength attribute on input controls from the column lengths
      // in the table.
      if (this._schema)
        this._setMaxLengthsFromSchema();
    },

    onInitPromisesResolved: function onInitPromisesResolved() {
      // This means some class, us or another, installed some init promises.  We do so if
      // validationTable is set so we can get the table schema.
      //
      // If validationTable is not null then we need to configure the table-based validations
      // and max-lengths.
      // If we are supposed to autovalidate based on the database table, create
      // a validation setting for each column that doesn't have manual
      // validation.

      if (this._schema) {
        // Now add validation for all of the columns in the schema.  We'll check the data
        // type, required, etc.  Remember that just because it is in the table doesn't mean
        // it is in the form, so we add mayNotExist.

        var _this = this;
        _.each(this._schema.cols, function(col) {
          if (!_this._validations[col.name]) {
            _this._validations[col.name] = {
              mayNotExist: true,
              func: _this._autoValidateFunc.bind(_this),
              generated: true,
              col: col
            };
          }
        });

        // If the schema was not already cached, we probably rendered the form before we
        // got here.  If so, set the maxlengths now.

        if (_this.$('input').length)
          _this._setMaxLengthsFromSchema();
      }
    },

    _createValidations: function() {
      this._validations = {};

      this.$el.on('focusout', '[name]', this._onFocusOut.bind(this));

      this._groupValidationClasses = {};
      // Used to track the validation result class (e.g. "has-error") for each
      // control in a group. Maps from group name to control name to class.
      // Class should be null if there is no error.  In the example below, the
      // class "billingUnit" has 3 controls.  The form-group will be assigned
      // the "has-error" class.
      //
      //   _groupValidationClasses['billingUnit'] = {
      //     value: 'has-error',
      //     unit:  null,
      //     other: 'has-warning'
      //   }

      var groupMembers = {};
      // Maps from each group name to an array of names for the controls in the
      // group.  This allows us to determine if the control we are about to
      // enter is in the same group as the one we are leaving.

      // jshint loopfunc:true

      for (var keys in this.validations) {
        var value = this.validations[keys];
        var func = this[value];
        console.assert(func, 'No validation function exists with name "' + value + '"');

        keys.split(/\s+/).forEach(function(name) {

          var group       = null;
          var mayNotExist = false;

          if (/[?]$/.test(name)) {
            // optional control: ssn?
            mayNotExist = true;
            name = name.substr(0, name.length-1); // remove trailing '?'
          }

          var match = /^(.+)\{(.+)\}$/.exec(name);
          if (match) {
            // group name: date{billDate}
            name  = match[1];
            group = match[2];
          }

          if (group) {
            if (!groupMembers[group])
              groupMembers[group] = [];
            groupMembers[group].push(name);
          }

          var settings = {
            group: group,                                     // the group we belong to, possibly null
            groupMembers: group ? groupMembers[group] : null, // what controls are part of this group?
            mayNotExist: mayNotExist,
            func: func.bind(this)                             // the user-defined validation function
          };

          // Store the settings later for the submit _validation function.
          this._validations[name] = settings;

        }, this);
      }
    },

    _onFocusOut: function(e) {
      // Called when focus leaves a control.  See if we have a validation for
      // it.

      var target = $(e.target);
      var name  = target.attr('name');

      var settings = this._validations[name];
      if (!settings)
        return;

      if (name && this.ignoreWarningsButtonInfo && this.ignoreWarningsButtonInfo.warningMode) {
        // We were displaying the 'Ignore Warning' button.  Since we just left a control, reset
        // it back to Save (or whatever).
        this.setWarningButtonMode(false);
      }

      this._validateField(target, settings, {
        blur: true
      });

      // If this control is part of a group and we are leaving the group (the next control
      // is not part of the group), then apply the validation result classes to the group.
      if (settings.group) {
        var nextName = $(e.relatedTarget).attr('name');
        if (settings.groupMembers.indexOf(nextName) === -1) {
          // Not in the same group (or not in a group), so apply our settings now.
          this._applyValidationClasses(target, _.values(this._groupValidationClasses[settings.group]));
        }
      }
    },

    _autoValidateFunc: function(value, target, options) {
      // This is the validation function shared by all controls using
      // auto-validation based on the schema.

      var col = options.col;
      if (value.length === 0 && !col.nullable && !col.has_default) {
        return {
          className: 'has-error'
        };
      }
      return undefined;
    },

    _validateField: function(target, settings, options) {
      // Calls the user-defined validation for a single control.  It applies the control-specific
      // results such as reformatting the text or defining the data('json') value.
      //
      // The validation class, such as "has-error", is applied to the form-group which may
      // encompass multiple controls, so it must be handled by the caller.  The user-defined
      // validation function's result is returned just for this.
      //
      // options:
      // - blur

      var val = target.val();
      // This can be null, not always an empty string.
      if (val)
        val = val.trim();

      options.col = settings.col;
      var result = settings.func(val, target, options);

      target.closest('.form-group').find('.help-block.validation').remove();

      target.removeData('json');

      if (result) {
        if (result.val)
          target.val(result.val);

        if (result.help)
          target.closest('.form-group').append(this._validationHelp(result.help));

        if (result.json !== undefined) {
          target.data('json', result.json);
        }
      }

      var className = result ? result.className : null;

      if (!settings.group) {
        // This control is not part of a group, so simply apply the results.
        this._applyValidationClasses(target, [ className ]);

      } else {
        // This control is part of a group, so save its validation class (has-error, etc.).
        // If we're also leaving the group, apply the results for the group.

        var name = target.attr('name');
        if (!this._groupValidationClasses[settings.group])
          this._groupValidationClasses[settings.group] = {};
        this._groupValidationClasses[settings.group][name] = className;
      }
    },

    _applyValidationClasses: function(target, classNames) {
      // Updates the target's form-group class from a (possibly empty) list of validation result
      // classes (e.g. ['has-error', null, 'has-warning'] --> 'has-error').
      //
      // Separated from other validation code so that we can examine all classes

      var formGroup = target.closest('.form-group');

      // Did not find the enclosing "form-group".  Do you have one?
      console.assert(formGroup, "Did not find form group for target " + target);

      formGroup.removeClass('has-error has-warning has-success');

      var classes = [ null, 'has-success', 'has-warning', 'has-error' ];

      var maxIndex = classNames.reduce(function(prevIndex, className) {
        if (className == null) // or undefined
          return prevIndex;
        return Math.max(prevIndex, classes.indexOf(className));
      }, 0);

      if (maxIndex > 0)
        formGroup.addClass(classes[maxIndex]);
    },
    validate: function() {
      // Runs all validations and returns true if all valid, false otherwise.  If no valid, sets
      // focus to the first invalid control.

      if (this._validations) {
        // First perform validation for each control.  Controls that are part of a group will
        // only cache their desired class name in _groupValidationClasses.

        _.each(this._validations, function(settings, name) {
          var target = this.$('[name=' + name + ']');

          if (settings.mayNotExist && target.length === 0)
            return;

          if (settings.generated && target.length === 0) {
            // We put a validation entry in for every column in the table, but a
            // lot of columns won't have controls.
            return;
          }

          // Safari's assert is broken and isn't printing the value, making it difficult to
          // debug.
          if (target.length !== 1)
            throw new Error('Validation setup failed - there is no control named "' + name + '"');

          // console.assert(target.length === 1, name);
          //

          this._validateField(target, settings, {
            blur: false,
            col:  settings.col
          });
        }, this);

        // Now loop through the groups and pick the most severe class to apply (has-error, etc.).

        if (this._groupValidationClasses) {
          _.each(this._groupValidationClasses, function(controls, groupName) {
            // controls -> { ctrl1: "has-error", ctrl2: null }
            // We need a jQuery object of one of the controls so we can get to the form-group.
            // Grab the first one.
            var controlNames = Object.keys(controls);
            if (controlNames.length) {
              var target = $('[name="' + controlNames[0] + '"]');
              this._applyValidationClasses(target, _.values(controls));
            }
          }, this);
        }
      }

      this.manualValidate();

      var first = this.$('.has-error:first');

      if (first.length !== 0) {
        first
          .find('input,select').filter(':first')
          .focus();
        return false;
      }

      if (this.ignoreWarningsButtonInfo && !this.ignoreWarningsButtonInfo.warningMode) {
        if (this.$('.has-warning:first').length > 0) {
          this.setWarningButtonMode(true);
          return false;
        }
      }

      return true;
    }
  };

}());
