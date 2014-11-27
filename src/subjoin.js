define(function () {
  function PrototypalIntermediate() {}

  /**
   * Appends {@code subtype} to {@code opt_supertype}'s prototype chain so that
   * {@code subtype} inherits all of the methods and properties defined by its
   * ancestor types in the chain, including the core {@code Object} prototype;
   * furthermore, {@code opt_supertype} will be made accessible via the
   * {@code subtype.supertype} property (or, from within a {@code subtype}
   * instance, the {@code this.constructor.supertype} property).
   *
   * @param {!Function} subtype The constructor that will inherit methods and
   *     properties from {@code opt_supertype} by being appended to its
   *     prototype chain.
   * @param {Function=} opt_supertype The constructor of the prototype chain
   *     that {@code subtype} will join, if specified; the core {@code Object}
   *     constructor otherwise.
   *
   * @return {!Function} {@code subtype} after it has been subjoined with the
   *     {@code opt_supertype} prototype chain.
   *
   * @private
   */
  return function subjoin(subtype, opt_supertype) {
    opt_supertype = opt_supertype || Object;
    PrototypalIntermediate.prototype = opt_supertype.prototype;
    subtype.prototype = new PrototypalIntermediate();
    subtype.supertype = opt_supertype;
    subtype.prototype.constructor = subtype;

    return subtype;
  };
});