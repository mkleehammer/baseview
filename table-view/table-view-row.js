define('TableViewRow', function() {
  'use strict';

  function Row(table, index, data) {
    this.table = table;
    this.index = index;
    this.data  = data;
  }

  Row.prototype.replace = function replace(newData, options) {
    var oldData = this.data;
    this.data = newData;
    this.index = this.table._replaceRow(this.index, oldData, this.data, options);
  };

  Row.prototype.update = function update(newData, options) {
    $.extend(this.data, newData);
    this.index = this.table._replaceRow(this.index, this.data, this.data, options);
  };

  Row.prototype.remove = function remove() {
    if (this.index >= 0) {
      this.table._removeRow(this.index, this.data);
      this.index = -1;
    }
  };

  Row.prototype.highlight = function highlight() {
    console.log('hi:', this);
    if (this.index >= 0) {
      this.table._highlightTableIndex(this.index);
    }
  };

  return Row;
});
