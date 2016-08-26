define('TableViewRow', function() {
  'use strict';

  function Row(table, index, data) {
    this.table = table;
    this.index = index;
    this.data  = data;
  }

  _.extend(Row.prototype, {
    replace: function replace(newData, options) {
      var oldData = this.data;
      this.data  = newData;
      this.index = this.table._replaceRow(this.index, oldData, this.data, options);
    },

    update: function update(newData, options) {
      $.extend(this.data, newData);
      this.index = this.table._replaceRow(this.index, this.data, this.data, options);
    },

    remove: function remove() {
      if (this.index >= 0) {
        this.table._removeRow(this.index, this.data);
        this.index = -1;
      }
    },

    highlight: function highlight() {
      if (this.index >= 0) {
        this.table._highlightTableIndex(this.index);
      }
    },

    hasChild: function hasChild() {
      if (this.index < 0) {
        // The row has been removed.
        return false;
      }
      return this.table._hasChild(this.index);
    },

    createChild: function(options) {
      this.table._createChild(this.index, options);
    },

    removeChild: function() {
      this.table._removeChild(this.index);
    }
  });

  return Row;
});
