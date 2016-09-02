(function() {
  'use strict';

  // TODO: Document

  /*global Cocktail */

  Cocktail.mixins['invalidate'] = {
    _invalid: false,

    invalidate: function() {
      if (!this._invalid) {
        this._invalid = true;
        setTimeout(function() {
          this._invalid = false;
          this.render();
        }.bind(this), 0);
      }
    }
  };
}());
